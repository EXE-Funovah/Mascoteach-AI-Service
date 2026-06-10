import { randomUUID } from 'crypto';
import {
    CreateMascotLiveSessionInput,
    MascotLiveReadiness,
    MascotLiveRuntimeConfig,
    MascotLiveSession,
    OpenAiRealtimeClientSecret,
} from '../types/mascot-live.types';

export class OpenAiLiveConfigError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'OpenAiLiveConfigError';
    }
}

export class OpenAiLiveService {
    private readonly sessions = new Map<string, MascotLiveSession>();

    constructor(private readonly config: MascotLiveRuntimeConfig) {}

    getReadiness(): MascotLiveReadiness {
        return {
            provider: this.config.provider,
            engine: this.config.engine,
            configured: this.config.isConfigured,
            apiBaseUrl: this.config.apiBaseUrl,
            model: this.config.realtimeModel,
            language: this.config.defaultLanguage,
            voice: this.config.defaultVoice,
            missingFields: [...this.config.missingFields],
        };
    }

    async createSession(input: CreateMascotLiveSessionInput): Promise<MascotLiveSession> {
        if (!this.config.isConfigured || !this.config.apiKey) {
            throw new OpenAiLiveConfigError(
                `OpenAI Realtime is not configured. Missing: ${this.config.missingFields.join(', ') || 'unknown fields'}`,
            );
        }

        const now = new Date();
        const sessionId = randomUUID();
        const language = input.language?.trim() || this.config.defaultLanguage;
        const voice = input.voice?.trim() || this.config.defaultVoice;
        const clientSecret = await this.createClientSecret(language, voice);

        const session: MascotLiveSession = {
            provider: 'openai',
            engine: this.config.engine,
            sessionId,
            status: 'created',
            createdAt: now.toISOString(),
            endedAt: null,
            displayName: input.displayName?.trim() || 'Mascot learner',
            language,
            voice,
            model: this.config.realtimeModel,
            clientSecret,
            connection: {
                apiBaseUrl: this.config.apiBaseUrl,
                callEndpoint: '/v1/realtime/calls',
                dataChannelLabel: 'oai-events',
                transport: 'webrtc',
            },
            notes: [
                'Frontend should connect to OpenAI Realtime over WebRTC using the ephemeral client secret from this session.',
                'Frontend should stream microphone audio directly to the Realtime session and play the returned remote audio track.',
                'Close the RTCPeerConnection when the learner ends the session.',
            ],
        };

        this.sessions.set(sessionId, session);
        return session;
    }

    getSession(sessionId: string): MascotLiveSession | null {
        return this.sessions.get(sessionId) ?? null;
    }

    async endSession(sessionId: string): Promise<MascotLiveSession> {
        const existing = this.sessions.get(sessionId);
        if (!existing) {
            throw new OpenAiLiveConfigError(`Mascot live session not found: ${sessionId}`);
        }

        const ended: MascotLiveSession = {
            ...existing,
            status: 'ended',
            endedAt: new Date().toISOString(),
        };

        this.sessions.set(sessionId, ended);
        return ended;
    }

    private async createClientSecret(
        language: string,
        voice: string,
    ): Promise<OpenAiRealtimeClientSecret> {
        const response = await fetch(`${this.config.apiBaseUrl.replace(/\/+$/, '')}/v1/realtime/client_secrets`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.config.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                expires_after: {
                    anchor: 'created_at',
                    seconds: this.config.sessionTtlSeconds,
                },
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
                            turn_detection: {
                                type: 'server_vad',
                            },
                        },
                        output: {
                            voice,
                        },
                    },
                },
            }),
        });

        const rawBody = await this.parseResponseBody(response);

        if (!response.ok) {
            throw new OpenAiLiveConfigError(
                `OpenAI Realtime client secret request failed (${response.status}): ${this.stringifyUnknown(rawBody)}`,
            );
        }

        const clientSecretValue =
            this.readString(rawBody, ['value']) ||
            this.readString(rawBody, ['client_secret', 'value']) ||
            this.readString(rawBody, ['clientSecret', 'value']) ||
            this.readString(rawBody, ['client_secret']) ||
            this.readString(rawBody, ['clientSecret']);

        if (!clientSecretValue) {
            throw new OpenAiLiveConfigError('OpenAI Realtime response did not include an ephemeral client secret.');
        }

        const expiresAt =
            this.readDateLike(rawBody, ['expires_at']) ||
            this.readString(rawBody, ['expiresAt']) ||
            this.readDateLike(rawBody, ['client_secret', 'expires_at']) ||
            this.readString(rawBody, ['clientSecret', 'expiresAt']) ||
            new Date(Date.now() + this.config.sessionTtlSeconds * 1000).toISOString();

        return {
            value: clientSecretValue,
            expiresAt,
        };
    }

    private async parseResponseBody(response: Response): Promise<unknown> {
        const text = await response.text();
        if (!text) {
            return null;
        }

        try {
            return JSON.parse(text);
        } catch {
            return text;
        }
    }

    private readString(value: unknown, path: string[]): string | null {
        let current: unknown = value;
        for (const key of path) {
            if (!current || typeof current !== 'object' || !(key in current)) {
                return null;
            }

            current = (current as Record<string, unknown>)[key];
        }

        return typeof current === 'string' && current.trim() ? current : null;
    }

    private readDateLike(value: unknown, path: string[]): string | null {
        let current: unknown = value;
        for (const key of path) {
            if (!current || typeof current !== 'object' || !(key in current)) {
                return null;
            }

            current = (current as Record<string, unknown>)[key];
        }

        if (typeof current === 'number' && Number.isFinite(current)) {
            return new Date(current * 1000).toISOString();
        }

        return typeof current === 'string' && current.trim() ? current : null;
    }

    private stringifyUnknown(value: unknown): string {
        if (typeof value === 'string') {
            return value;
        }

        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }
}
