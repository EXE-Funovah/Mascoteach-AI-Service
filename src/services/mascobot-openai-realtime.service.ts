import WebSocket, { ClientOptions, RawData } from 'ws';
import { MascotLiveRuntimeConfig } from '../types/mascot-live.types';
import {
    MascobotLivePeerConnection,
    MascobotLivePeerState,
    MascobotLiveRole,
    MascobotLiveSessionState,
    MascobotRobotState,
} from '../types/mascobot.types';

type UpstreamState = MascobotLiveSessionState['upstreamState'];

interface RealtimeServerEvent {
    type?: string;
    delta?: string;
    transcript?: string;
    error?: {
        message?: string;
    };
    response?: {
        status?: string;
    };
}

interface RealtimeSocketLike {
    readonly readyState: number;
    on(event: 'open', listener: () => void): this;
    on(event: 'close', listener: (code: number, reason: Buffer) => void): this;
    on(event: 'error', listener: (error: Error) => void): this;
    on(event: 'message', listener: (data: RawData) => void): this;
    send(data: string): void;
    close(code?: number): void;
}

type RealtimeSocketFactory = (url: string, options: ClientOptions) => RealtimeSocketLike;

interface SessionConnectionState {
    session: MascobotLiveSessionState;
    eyeConnection: MascobotLivePeerConnection | null;
    eyeConnectionId: string | null;
    mainConnection: MascobotLivePeerConnection | null;
    mainConnectionId: string | null;
    upstream: RealtimeSocketLike | null;
    assistantAudioParts: Buffer[];
    pendingEyeAudioParts: Buffer[];
    flushTimer: NodeJS.Timeout | null;
    sessionExpiryTimer: NodeJS.Timeout | null;
}

const OPEN = 1;
const CONNECTING = 0;
const MAIN_PCM_CHUNK_BYTES = 960; // 20 ms of 24 kHz mono PCM16
const MAIN_PCM_CHUNK_INTERVAL_MS = 20;
const MAIN_AUDIO_MAGIC_0 = 0x4d; // M
const MAIN_AUDIO_MAGIC_1 = 0x41; // A
const MAIN_AUDIO_CODEC_PCM16 = 0;
const MAIN_AUDIO_CODEC_ULAW = 1;
const MAX_PENDING_EYE_AUDIO_CHUNKS = 128;
const SESSION_EXPIRY_GRACE_MS = 15000;

export class MascobotOpenAiRealtimeService {
    private readonly sessions = new Map<string, SessionConnectionState>();

    constructor(
        private readonly config: MascotLiveRuntimeConfig,
        private readonly createSocket: RealtimeSocketFactory = (url, options) => new WebSocket(url, options),
    ) {}

    private log(message: string, meta?: Record<string, unknown>): void {
        const suffix = meta ? ` ${JSON.stringify(meta)}` : '';
        console.log(`[MascobotOpenAiRealtimeService] ${message}${suffix}`);
    }

    connectPeer(connection: MascobotLivePeerConnection): MascobotLiveSessionState {
        const now = new Date().toISOString();
        const state = this.getOrCreate(connection.sessionId);
        const connectionId = connection.connectionId || `${connection.role}:${connection.deviceId}:${Date.now()}`;
        if (state.sessionExpiryTimer) {
            clearTimeout(state.sessionExpiryTimer);
            state.sessionExpiryTimer = null;
        }
        const peerState: MascobotLivePeerState = {
            sessionId: connection.sessionId,
            deviceId: connection.deviceId,
            role: connection.role,
            connectedAt: now,
            lastSeenAt: now,
        };

        if (connection.role === 'eye') {
            if (state.eyeConnectionId && state.eyeConnectionId !== connectionId) {
                this.log('peer replaced', {
                    sessionId: connection.sessionId,
                    deviceId: connection.deviceId,
                    role: connection.role,
                    previousConnectionId: state.eyeConnectionId,
                    nextConnectionId: connectionId,
                });
            }
            state.eyeConnection = connection;
            state.eyeConnectionId = connectionId;
            state.session.eye = peerState;
        } else {
            if (state.mainConnectionId && state.mainConnectionId !== connectionId) {
                this.log('peer replaced', {
                    sessionId: connection.sessionId,
                    deviceId: connection.deviceId,
                    role: connection.role,
                    previousConnectionId: state.mainConnectionId,
                    nextConnectionId: connectionId,
                });
            }
            state.mainConnection = connection;
            state.mainConnectionId = connectionId;
            state.session.main = peerState;
        }

        this.log('peer connected', {
            sessionId: connection.sessionId,
            deviceId: connection.deviceId,
            role: connection.role,
            eyeConnected: !!state.session.eye,
            mainConnected: !!state.session.main,
        });

        this.notifyPeerState(state);
        this.ensureUpstream(state);
        return this.cloneSession(state.session);
    }

    disconnectPeer(sessionId: string, deviceId: string, role: MascobotLiveRole, connectionId: string): MascobotLiveSessionState | null {
        const state = this.sessions.get(sessionId);
        if (!state) {
            return null;
        }

        const activeConnectionId = role === 'eye' ? state.eyeConnectionId : state.mainConnectionId;
        if (activeConnectionId && activeConnectionId !== connectionId) {
            this.log('stale peer disconnect ignored', {
                sessionId,
                deviceId,
                role,
                connectionId,
                activeConnectionId,
            });
            return this.cloneSession(state.session);
        }

        const current = role === 'eye' ? state.session.eye : state.session.main;
        if (!current || current.deviceId !== deviceId) {
            return this.cloneSession(state.session);
        }

        if (role === 'eye') {
            state.eyeConnection = null;
            state.eyeConnectionId = null;
            state.session.eye = null;
        } else {
            state.mainConnection = null;
            state.mainConnectionId = null;
            state.session.main = null;
        }

        this.log('peer disconnected', {
            sessionId,
            deviceId,
            role,
            eyeConnected: !!state.session.eye,
            mainConnected: !!state.session.main,
        });

        if (!state.session.eye && !state.session.main) {
            state.sessionExpiryTimer = setTimeout(() => {
                const latest = this.sessions.get(sessionId);
                if (!latest || latest !== state) {
                    return;
                }
                if (latest.session.eye || latest.session.main) {
                    return;
                }
                this.log('session expired after peer grace window', {
                    sessionId,
                    graceMs: SESSION_EXPIRY_GRACE_MS,
                });
                this.closeUpstream(latest);
                this.sessions.delete(sessionId);
            }, SESSION_EXPIRY_GRACE_MS);
            return null;
        }

        if (role === 'main') {
            this.clearAssistantAudio(state);
            state.session.assistantSpeaking = false;
            this.setInputMuted(state, false);
        }
        this.notifyPeerState(state);
        return this.cloneSession(state.session);
    }

    relayEyeAudio(sessionId: string, deviceId: string, payload: Buffer): boolean {
        const state = this.sessions.get(sessionId);
        if (!state?.session.eye || state.session.eye.deviceId !== deviceId) {
            this.log('eye audio rejected', {
                sessionId,
                deviceId,
                reason: 'eye-session-mismatch',
                bytes: payload.byteLength,
            });
            return false;
        }

        state.session.eye.lastSeenAt = new Date().toISOString();
        if (state.session.inputMuted || !state.eyeConnection || !state.mainConnection) {
            this.log('eye audio rejected', {
                sessionId,
                deviceId,
                reason: state.session.inputMuted ? 'input-muted' : (!state.eyeConnection ? 'no-eye-connection' : 'no-main-connection'),
                bytes: payload.byteLength,
                upstreamState: state.session.upstreamState,
            });
            return false;
        }

        this.ensureUpstream(state);
        if (!state.upstream || state.upstream.readyState !== OPEN) {
            this.queuePendingEyeAudio(state, payload);
            this.log('eye audio queued', {
                sessionId,
                deviceId,
                bytes: payload.byteLength,
                pendingChunks: state.pendingEyeAudioParts.length,
                upstreamState: state.session.upstreamState,
            });
            return true;
        }

        this.sendUpstreamAudioChunk(state, payload);
        return true;
    }

    getSession(sessionId: string): MascobotLiveSessionState | null {
        const state = this.sessions.get(sessionId);
        return state ? this.cloneSession(state.session) : null;
    }

    getSummary() {
        const sessions = [...this.sessions.values()].map((state) => this.cloneSession(state.session));
        return {
            activeSessions: sessions.length,
            configured: this.config.isConfigured,
            sessions,
        };
    }

    private getOrCreate(sessionId: string): SessionConnectionState {
        const existing = this.sessions.get(sessionId);
        if (existing) {
            return existing;
        }

        const created: SessionConnectionState = {
            session: {
                sessionId,
                eye: null,
                main: null,
                upstreamState: 'disconnected',
                inputMuted: false,
                assistantSpeaking: false,
                uploadedChunks: 0,
                uploadedBytes: 0,
                relayedChunks: 0,
                relayedBytes: 0,
                lastAudioAt: null,
                lastAssistantAudioAt: null,
                lastTranscript: null,
            },
            eyeConnection: null,
            eyeConnectionId: null,
            mainConnection: null,
            mainConnectionId: null,
            upstream: null,
            assistantAudioParts: [],
            pendingEyeAudioParts: [],
            flushTimer: null,
            sessionExpiryTimer: null,
        };
        this.sessions.set(sessionId, created);
        return created;
    }

    private ensureUpstream(state: SessionConnectionState): void {
        if (!this.config.isConfigured || !this.config.apiKey || !state.eyeConnection || !state.mainConnection) {
            if (!this.config.isConfigured || !this.config.apiKey) {
                this.broadcastText(state, {
                    type: 'openai_error',
                    message: `OpenAI Realtime is not configured. Missing: ${this.config.missingFields.join(', ') || 'OPENAI_API_KEY'}`,
                });
            }
            return;
        }

        if (state.upstream && (state.upstream.readyState === OPEN || state.upstream.readyState === CONNECTING)) {
            return;
        }

        const upstream = this.createSocket(this.getRealtimeUrl(), {
            headers: {
                Authorization: `Bearer ${this.config.apiKey}`,
            },
        });

        state.upstream = upstream;
        this.setUpstreamState(state, 'connecting');
        this.log('upstream connecting', {
            sessionId: state.session.sessionId,
            eyeConnected: !!state.session.eye,
            mainConnected: !!state.session.main,
        });

        upstream.on('open', () => {
            this.setUpstreamState(state, 'connected');
            this.log('upstream connected', {
                sessionId: state.session.sessionId,
            });
            this.sendSessionUpdate(state);
            this.flushPendingEyeAudio(state);
        });

        upstream.on('message', (data) => {
            this.handleUpstreamMessage(state, data);
        });

        upstream.on('error', (error) => {
            this.handleUpstreamFailure(state, error.message || 'Unknown upstream error');
        });

        upstream.on('close', (_code, reason) => {
            const message = reason?.toString?.() || 'OpenAI Realtime socket closed';
            this.handleUpstreamFailure(state, message, false);
        });
    }

    private sendSessionUpdate(state: SessionConnectionState): void {
        if (!state.upstream || state.upstream.readyState !== OPEN) {
            return;
        }

        state.upstream.send(
            JSON.stringify({
                type: 'session.update',
                session: {
                    type: 'realtime',
                    model: this.config.realtimeModel,
                    instructions: this.config.systemPrompt,
                    reasoning: {
                        effort: this.config.reasoningEffort,
                    },
                    max_output_tokens: this.config.maxOutputTokens,
                    audio: {
                        input: {
                            format: {
                                type: 'audio/pcm',
                                rate: this.config.botAudioSampleRateHz,
                            },
                            noise_reduction: {
                                type: 'near_field',
                            },
                            transcription: {
                                model: this.config.inputTranscriptionModel,
                                language: this.config.defaultLanguage,
                            },
                            turn_detection: {
                                type: 'server_vad',
                                prefix_padding_ms: this.config.vadPrefixPaddingMs,
                                silence_duration_ms: this.config.vadSilenceDurationMs,
                                threshold: this.config.vadThreshold,
                            },
                        },
                        output: {
                            format: {
                                type: 'audio/pcm',
                                rate: this.config.botAudioSampleRateHz,
                            },
                            voice: this.config.defaultVoice,
                        },
                    },
                },
            }),
        );
    }

    private queuePendingEyeAudio(state: SessionConnectionState, payload: Buffer): void {
        if (state.pendingEyeAudioParts.length >= MAX_PENDING_EYE_AUDIO_CHUNKS) {
            state.pendingEyeAudioParts.shift();
        }
        state.pendingEyeAudioParts.push(Buffer.from(payload));
    }

    private flushPendingEyeAudio(state: SessionConnectionState): void {
        if (!state.upstream || state.upstream.readyState !== OPEN) {
            return;
        }

        if (state.pendingEyeAudioParts.length === 0) {
            return;
        }

        this.log('flushing pending eye audio', {
            sessionId: state.session.sessionId,
            chunks: state.pendingEyeAudioParts.length,
        });

        for (const chunk of state.pendingEyeAudioParts) {
            this.sendUpstreamAudioChunk(state, chunk);
        }
        state.pendingEyeAudioParts = [];
    }

    private sendUpstreamAudioChunk(state: SessionConnectionState, payload: Buffer): void {
        if (!state.upstream || state.upstream.readyState !== OPEN) {
            return;
        }

        state.session.uploadedChunks += 1;
        state.session.uploadedBytes += payload.byteLength;
        state.session.lastAudioAt = new Date().toISOString();
        if (state.session.uploadedChunks <= 3 || (state.session.uploadedChunks % 25) === 0) {
            this.log('upstream audio appended', {
                sessionId: state.session.sessionId,
                uploadedChunks: state.session.uploadedChunks,
                bytes: payload.byteLength,
            });
        }

        state.upstream.send(
            JSON.stringify({
                type: 'input_audio_buffer.append',
                audio: payload.toString('base64'),
            }),
        );
    }

    private handleUpstreamMessage(state: SessionConnectionState, raw: RawData): void {
        const event = this.parseRealtimeEvent(raw);
        if (!event?.type) {
            return;
        }

        switch (event.type) {
            case 'input_audio_buffer.speech_started':
                this.broadcastState(state, 'listening');
                break;
            case 'input_audio_buffer.speech_stopped':
                this.broadcastState(state, 'thinking');
                break;
            case 'response.created':
                this.clearAssistantAudio(state);
                this.setInputMuted(state, true);
                this.broadcastState(state, 'thinking');
                break;
            case 'response.output_audio.delta':
            case 'response.audio.delta':
                this.forwardAssistantAudio(state, event.delta);
                break;
            case 'response.output_audio.done':
            case 'response.audio.done':
            case 'response.done':
                this.finishAssistantTurn(state);
                break;
            case 'conversation.item.input_audio_transcription.completed':
                if (event.transcript?.trim()) {
                    state.session.lastTranscript = event.transcript.trim();
                    this.broadcastText(state, {
                        type: 'transcript',
                        transcript: state.session.lastTranscript,
                    });
                }
                break;
            case 'error':
                this.handleUpstreamFailure(
                    state,
                    event.error?.message || 'OpenAI Realtime reported an error',
                );
                break;
            default:
                break;
        }
    }

    private forwardAssistantAudio(state: SessionConnectionState, delta: string | undefined): void {
        if (!delta?.trim()) {
            return;
        }

        const audio = Buffer.from(delta, 'base64');
        if (audio.byteLength === 0) {
            return;
        }

        state.session.assistantSpeaking = true;
        state.session.relayedChunks += 1;
        state.session.relayedBytes += audio.byteLength;
        state.session.lastAssistantAudioAt = new Date().toISOString();
        this.setInputMuted(state, true);
        state.assistantAudioParts.push(audio);
    }

    private finishAssistantTurn(state: SessionConnectionState): void {
        this.flushAssistantAudio(state);
    }

    private setInputMuted(state: SessionConnectionState, muted: boolean): void {
        if (state.session.inputMuted === muted) {
            return;
        }

        state.session.inputMuted = muted;
        if (!state.eyeConnection) {
            return;
        }

        state.eyeConnection.sendText(
            JSON.stringify({
                type: muted ? 'mute_input' : 'unmute_input',
                sessionId: state.session.sessionId,
            }),
        );
    }

    private broadcastState(state: SessionConnectionState, robotState: MascobotRobotState): void {
        this.broadcastText(state, {
            type: 'state',
            sessionId: state.session.sessionId,
            state: robotState,
        });
    }

    private notifyPeerState(state: SessionConnectionState): void {
        this.broadcastText(state, {
            type: state.session.eye && state.session.main ? 'peer_ready' : 'peer_waiting',
            sessionId: state.session.sessionId,
            eyeConnected: !!state.session.eye,
            mainConnected: !!state.session.main,
            upstreamState: state.session.upstreamState,
        });
    }

    private broadcastText(state: SessionConnectionState, payload: Record<string, unknown>): void {
        const text = JSON.stringify(payload);
        state.eyeConnection?.sendText(text);
        state.mainConnection?.sendText(text);
    }

    private flushAssistantAudio(state: SessionConnectionState): void {
        if (state.flushTimer || !state.mainConnection) {
            return;
        }

        const combined = state.assistantAudioParts.length > 0
            ? Buffer.concat(state.assistantAudioParts)
            : Buffer.alloc(0);
        state.assistantAudioParts = [];

        if (combined.byteLength === 0) {
            state.session.assistantSpeaking = false;
            this.setInputMuted(state, false);
            this.broadcastState(state, 'listening');
            return;
        }

        state.session.assistantSpeaking = true;
        this.broadcastState(state, 'speaking');

        let offset = 0;
        const sendNextChunk = () => {
            if (!state.mainConnection) {
                state.flushTimer = null;
                state.session.assistantSpeaking = false;
                this.setInputMuted(state, false);
                return;
            }

            if (offset >= combined.byteLength) {
                state.flushTimer = null;
                state.session.assistantSpeaking = false;
                this.setInputMuted(state, false);
                this.broadcastState(state, 'listening');
                return;
            }

            const pcmChunk = combined.subarray(offset, offset + MAIN_PCM_CHUNK_BYTES);
            state.mainConnection.sendBinary(this.encodeMainAudioChunk(pcmChunk));
            offset += pcmChunk.byteLength;
            state.flushTimer = setTimeout(sendNextChunk, MAIN_PCM_CHUNK_INTERVAL_MS);
        };

        sendNextChunk();
    }

    private encodeMainAudioChunk(pcmChunk: Buffer): Buffer {
        const ulawPayload = this.encodePcm16ToMuLaw(pcmChunk);
        const framed = Buffer.allocUnsafe(4 + ulawPayload.length);
        framed[0] = MAIN_AUDIO_MAGIC_0;
        framed[1] = MAIN_AUDIO_MAGIC_1;
        framed[2] = MAIN_AUDIO_CODEC_ULAW;
        framed[3] = 0;
        ulawPayload.copy(framed, 4);
        return framed;
    }

    private encodePcm16ToMuLaw(pcmChunk: Buffer): Buffer {
        const sampleCount = Math.floor(pcmChunk.byteLength / 2);
        const encoded = Buffer.allocUnsafe(sampleCount);
        for (let i = 0; i < sampleCount; i += 1) {
            const sample = pcmChunk.readInt16LE(i * 2);
            encoded[i] = this.linearToMuLawSample(sample);
        }
        return encoded;
    }

    private linearToMuLawSample(sample: number): number {
        const MULAW_MAX = 0x1fff;
        const MULAW_BIAS = 33;

        let pcm = sample;
        let mask = 0xff;
        if (pcm < 0) {
            pcm = -pcm;
            mask = 0x7f;
        }

        pcm += MULAW_BIAS;
        if (pcm > MULAW_MAX) {
            pcm = MULAW_MAX;
        }

        let segment = 0;
        let value = pcm >> 6;
        while (value > 1 && segment < 7) {
            segment += 1;
            value >>= 1;
        }

        const mantissa = (pcm >> (segment + 1)) & 0x0f;
        return (~((segment << 4) | mantissa) & mask) & 0xff;
    }

    private clearAssistantAudio(state: SessionConnectionState): void {
        state.assistantAudioParts = [];
        state.pendingEyeAudioParts = [];
        if (state.flushTimer) {
            clearTimeout(state.flushTimer);
            state.flushTimer = null;
        }
    }

    private handleUpstreamFailure(
        state: SessionConnectionState,
        message: string,
        shouldClose: boolean = true,
    ): void {
        this.log('upstream failure', {
            sessionId: state.session.sessionId,
            message,
            shouldClose,
            eyeConnected: !!state.session.eye,
            mainConnected: !!state.session.main,
        });
        this.clearAssistantAudio(state);
        if (shouldClose) {
            this.closeUpstream(state);
        } else {
            state.upstream = null;
        }

        state.session.assistantSpeaking = false;
        this.setInputMuted(state, false);
        this.setUpstreamState(state, 'error');
        this.broadcastText(state, {
            type: 'openai_error',
            sessionId: state.session.sessionId,
            message,
        });
    }

    private closeUpstream(state: SessionConnectionState): void {
        this.clearAssistantAudio(state);
        const upstream = state.upstream;
        state.upstream = null;
        if (upstream && (upstream.readyState === OPEN || upstream.readyState === CONNECTING)) {
            upstream.close(1000);
        }
        this.setUpstreamState(state, 'disconnected');
    }

    private setUpstreamState(state: SessionConnectionState, upstreamState: UpstreamState): void {
        state.session.upstreamState = upstreamState;
        this.notifyPeerState(state);
    }

    private getRealtimeUrl(): string {
        const wsBase = this.config.apiBaseUrl.replace(/\/+$/, '').replace(/^http/i, 'ws');
        return `${wsBase}/v1/realtime?model=${encodeURIComponent(this.config.realtimeModel)}`;
    }

    private parseRealtimeEvent(raw: RawData): RealtimeServerEvent | null {
        const text = Array.isArray(raw)
            ? Buffer.concat(raw.map((part) => Buffer.isBuffer(part) ? part : Buffer.from(part))).toString('utf8')
            : Buffer.isBuffer(raw)
                ? raw.toString('utf8')
                : raw instanceof ArrayBuffer
                    ? Buffer.from(raw).toString('utf8')
                : String(raw);

        if (!text) {
            return null;
        }

        try {
            return JSON.parse(text) as RealtimeServerEvent;
        } catch {
            return null;
        }
    }

    private cloneSession(session: MascobotLiveSessionState): MascobotLiveSessionState {
        return {
            sessionId: session.sessionId,
            eye: session.eye ? { ...session.eye } : null,
            main: session.main ? { ...session.main } : null,
            upstreamState: session.upstreamState,
            inputMuted: session.inputMuted,
            assistantSpeaking: session.assistantSpeaking,
            uploadedChunks: session.uploadedChunks,
            uploadedBytes: session.uploadedBytes,
            relayedChunks: session.relayedChunks,
            relayedBytes: session.relayedBytes,
            lastAudioAt: session.lastAudioAt,
            lastAssistantAudioAt: session.lastAssistantAudioAt,
            lastTranscript: session.lastTranscript,
        };
    }
}
