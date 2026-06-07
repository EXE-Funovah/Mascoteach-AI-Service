import { randomInt, randomUUID } from 'crypto';
import {
    AgoraLiveReadiness,
    AgoraLiveRuntimeConfig,
    AgoraLiveSession,
    CreateMascotLiveSessionInput,
} from '../types/mascot-live.types';

// CommonJS import because agora-token ships CommonJS exports.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { RtcRole, RtcTokenBuilder } = require('agora-token');

export class AgoraLiveConfigError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AgoraLiveConfigError';
    }
}

export class AgoraLiveService {
    private readonly sessions = new Map<string, AgoraLiveSession>();
    private readonly agentRtcTokens = new Map<string, string | null>();

    constructor(private readonly config: AgoraLiveRuntimeConfig) {}

    getReadiness(): AgoraLiveReadiness {
        return {
            provider: 'agora',
            engine: this.config.engine,
            configured: this.config.isConfigured,
            skipConvoAiJoinOnCreate: this.config.skipConvoAiJoinOnCreate,
            rtcReady: this.config.rtcReady,
            lifecycleApiReady: this.config.lifecycleApiReady,
            convoAiReady: this.config.convoAiReady,
            missingFields: [...this.config.missingFields],
            missingRtcFields: [...this.config.missingRtcFields],
            missingLifecycleFields: [...this.config.missingLifecycleFields],
            missingConvoAiFields: [...this.config.missingConvoAiFields],
        };
    }

    createSession(input: CreateMascotLiveSessionInput): AgoraLiveSession {
        if (!this.config.isConfigured || !this.config.appId) {
            throw new AgoraLiveConfigError(
                `Agora live is not configured. Missing: ${this.config.missingFields.join(', ') || 'unknown fields'}`,
            );
        }

        const now = new Date();
        const sessionId = randomUUID();
        const channelName = this.buildChannelName(sessionId);
        const uid = this.buildRtcUid();
        const agentRtcUid = this.buildRtcUidExcluding(uid);
        const expiresAt = new Date(now.getTime() + this.config.tokenExpirySeconds * 1000).toISOString();
        const token = this.buildRtcToken(channelName, uid);
        const agentToken = this.buildRtcToken(channelName, agentRtcUid);

        const session: AgoraLiveSession = {
            provider: 'agora',
            engine: this.config.engine,
            sessionId,
            status: 'created',
            createdAt: now.toISOString(),
            endedAt: null,
            displayName: input.displayName?.trim() || 'Mascot learner',
            language: input.language?.trim() || this.config.defaultLanguage,
            voice: input.voice?.trim() || this.config.defaultVoice,
            rtc: {
                appId: this.config.appId,
                channelName,
                uid,
                token,
                tokenExpiresAt: token ? expiresAt : null,
            },
            agent: {
                engine: this.config.engine,
                agentRtcUid: String(agentRtcUid),
                remoteRtcUids: ['*'],
                agentId: null,
                status: 'pending_backend_agent_start',
                transport: 'agora_rtc',
                lifecycleApiConfigured: this.config.lifecycleApiReady,
                joinAttemptedAt: null,
                lastError: null,
                rawJoinResponse: null,
                notes: [
                    'Frontend must join the Agora RTC channel and publish microphone audio.',
                    'Frontend must join RTC with the same integer UID returned by this backend.',
                    'Backend lifecycle start/stop/query against native Agora ConvoAI is managed through the REST API.',
                ],
            },
        };

        this.sessions.set(sessionId, session);
        this.agentRtcTokens.set(sessionId, agentToken);
        return session;
    }

    getSession(sessionId: string): AgoraLiveSession | null {
        return this.sessions.get(sessionId) ?? null;
    }

    async joinAgent(sessionId: string): Promise<AgoraLiveSession> {
        const existing = this.sessions.get(sessionId);
        if (!existing) {
            throw new AgoraLiveConfigError(`Agora live session not found: ${sessionId}`);
        }

        if (!this.config.appId || !this.config.pipelineId) {
            throw new AgoraLiveConfigError(
                `Agora native ConvoAI lifecycle is not configured. Missing: ${this.config.missingLifecycleFields.join(', ') || 'unknown fields'}`,
            );
        }

        const joinAttemptedAt = new Date().toISOString();
        const joinUrl = `${this.config.convoAiBaseUrl.replace(/\/+$/, '')}/projects/${this.config.appId}/join`;
        const agentToken = this.agentRtcTokens.get(sessionId);
        if (!agentToken) {
            throw new AgoraLiveConfigError('Agora agent RTC token could not be generated for the join request.');
        }
        const payload = this.buildJoinPayload(existing, agentToken);

        const response = await fetch(joinUrl, {
            method: 'POST',
            headers: {
                Authorization: this.buildAgoraAuthorization(agentToken),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        const rawBody = await this.parseResponseBody(response);
        if (!response.ok) {
            const joinErrorMessage = this.buildJoinErrorMessage(response.status, rawBody);
            const errored: AgoraLiveSession = {
                ...existing,
                status: 'error',
                agent: {
                    ...existing.agent,
                    joinAttemptedAt,
                    lastError: joinErrorMessage,
                    rawJoinResponse: rawBody,
                },
            };
            this.sessions.set(sessionId, errored);
            throw new AgoraLiveConfigError(errored.agent.lastError ?? 'Agora ConvoAI join failed');
        }

        const agentId = this.extractAgentId(rawBody);
        const joined: AgoraLiveSession = {
            ...existing,
            status: 'active',
            agent: {
                ...existing.agent,
                agentId,
                status: 'active',
                joinAttemptedAt,
                lastError: null,
                rawJoinResponse: rawBody,
            },
        };

        this.sessions.set(sessionId, joined);
        return joined;
    }

    async endSession(sessionId: string): Promise<AgoraLiveSession> {
        const existing = this.sessions.get(sessionId);
        if (!existing) {
            throw new AgoraLiveConfigError(`Agora live session not found: ${sessionId}`);
        }

        if (existing.agent.agentId && this.config.appId) {
            const leaveUrl =
                `${this.config.convoAiBaseUrl.replace(/\/+$/, '')}/projects/${this.config.appId}/agents/${existing.agent.agentId}/leave`;
            const agentToken = this.agentRtcTokens.get(sessionId);

            const response = await fetch(leaveUrl, {
                method: 'POST',
                headers: {
                    Authorization: agentToken
                        ? this.buildAgoraAuthorization(agentToken)
                        : this.buildBasicAuthorization(),
                    'Content-Type': 'application/json',
                },
            });

            const rawBody = await this.parseResponseBody(response);
            if (!response.ok) {
                const errored: AgoraLiveSession = {
                    ...existing,
                    status: 'error',
                    agent: {
                        ...existing.agent,
                        lastError: `Leave API failed (${response.status}): ${this.stringifyUnknown(rawBody)}`,
                        rawJoinResponse: rawBody,
                    },
                };
                this.sessions.set(sessionId, errored);
                throw new AgoraLiveConfigError(errored.agent.lastError ?? 'Agora ConvoAI leave failed');
            }
        }

        const ended: AgoraLiveSession = {
            ...existing,
            status: 'ended',
            endedAt: new Date().toISOString(),
            agent: {
                ...existing.agent,
                agentId: existing.agent.agentId,
                status: 'ended',
                lastError: null,
            },
        };

        this.sessions.set(sessionId, ended);
        this.agentRtcTokens.delete(sessionId);
        return ended;
    }

    private buildChannelName(sessionId: string): string {
        const base = `${this.config.defaultChannelPrefix}-${sessionId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)}`;
        return base.slice(0, 63);
    }

    private buildRtcUid(): number {
        return randomInt(100000000, 2000000000);
    }

    private buildRtcUidExcluding(disallowed: number): number {
        let uid = this.buildRtcUid();
        while (uid === disallowed) {
            uid = this.buildRtcUid();
        }

        return uid;
    }

    private buildRtcToken(channelName: string, uid: number): string | null {
        if (!this.config.appId || !this.config.appCertificate) {
            return null;
        }

        const currentTimestamp = Math.floor(Date.now() / 1000);
        const privilegeExpiry = currentTimestamp + this.config.tokenExpirySeconds;

        return RtcTokenBuilder.buildTokenWithUid(
            this.config.appId,
            this.config.appCertificate,
            channelName,
            uid,
            RtcRole.PUBLISHER,
            privilegeExpiry,
        );
    }

    private buildJoinPayload(session: AgoraLiveSession, agentToken: string): Record<string, unknown> {
        return {
            name: session.rtc.channelName,
            pipeline_id: this.config.pipelineId,
            properties: {
                asr: {
                    vendor: this.config.asrVendor,
                    language: this.config.asrLanguage,
                    params: {
                        url: this.config.asrUrl,
                        model: this.config.asrModel,
                        keyterm: '',
                        language: this.config.asrLanguage,
                    },
                },
                llm: {
                    url: this.config.llmUrl,
                    params: {
                        model: this.config.llmModel,
                    },
                    vendor: this.config.llmVendor,
                    failure_message: this.config.failureMessage,
                    system_messages: [
                        {
                            role: 'system',
                            content: this.config.systemPrompt,
                        },
                    ],
                    greeting_message: this.config.greetingMessage,
                },
                tts: {
                    vendor: this.config.ttsVendor,
                    params: {
                        url: this.config.ttsUrl,
                        model: this.config.ttsModel,
                        voice_setting: {
                            voice_id: this.config.ttsVoiceId,
                        },
                    },
                },
                parameters: {
                    silence_config: {
                        action: 'think',
                        content: 'politely ask if the user is still online',
                        timeout_ms: 10000,
                    },
                },
                idle_timeout: this.config.idleTimeoutSeconds,
                turn_detection: null,
                advanced_features: {
                    enable_rtm: true,
                    enable_sal: false,
                },
                channel: session.rtc.channelName,
                agent_rtc_uid: session.agent.agentRtcUid,
                remote_rtc_uids: session.agent.remoteRtcUids,
                token: agentToken,
                enable_string_uid: false,
            },
        };
    }

    private buildAgoraAuthorization(token: string): string {
        return `agora token=${token}`;
    }

    private buildBasicAuthorization(): string {
        const customerId = this.config.customerId ?? '';
        const customerSecret = this.config.customerSecret ?? '';
        const token = Buffer.from(`${customerId}:${customerSecret}`).toString('base64');
        return `Basic ${token}`;
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

    private extractAgentId(rawBody: unknown): string | null {
        if (!rawBody || typeof rawBody !== 'object') {
            return null;
        }

        const record = rawBody as Record<string, unknown>;
        const nestedData = typeof record.data === 'object' && record.data !== null
            ? (record.data as Record<string, unknown>)
            : null;

        const candidate =
            record.agent_id ??
            record.agentId ??
            record.agentid ??
            nestedData?.agent_id ??
            nestedData?.agentId ??
            nestedData?.agentid;

        return typeof candidate === 'string' && candidate.trim() ? candidate : null;
    }

    private buildJoinErrorMessage(statusCode: number, rawBody: unknown): string {
        const text = this.stringifyUnknown(rawBody);

        if (rawBody && typeof rawBody === 'object') {
            const record = rawBody as Record<string, unknown>;
            if (record.reason === 'ServiceNotEnabled') {
                return 'Join API failed (400): Agora Conversational AI Engine is not enabled for this Agora project. Enable the service in Agora Console, then retry.';
            }
        }

        return `Join API failed (${statusCode}): ${text}`;
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
