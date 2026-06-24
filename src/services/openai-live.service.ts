import { randomUUID } from 'crypto';
import {
    AuthenticatedMascotLiveUser,
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

export class MascotLiveQuotaExceededError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MascotLiveQuotaExceededError';
    }
}

export class MascotLiveForbiddenError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MascotLiveForbiddenError';
    }
}

export class MascotLiveSessionConflictError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MascotLiveSessionConflictError';
    }
}

interface OpenAiLiveServiceOptions {
    now?: () => Date;
}

export class OpenAiLiveService {
    private readonly sessions = new Map<string, MascotLiveSession>();
    private readonly countedUsageByUserDay = new Map<string, number>();
    private readonly activeSessionByUser = new Map<string, string>();
    private readonly now: () => Date;

    constructor(
        private readonly config: MascotLiveRuntimeConfig,
        options: OpenAiLiveServiceOptions = {},
    ) {
        this.now = options.now ?? (() => new Date());
    }

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

    async createSession(
        input: CreateMascotLiveSessionInput,
        requester?: AuthenticatedMascotLiveUser,
    ): Promise<MascotLiveSession> {
        if (!this.config.isConfigured || !this.config.apiKey) {
            throw new OpenAiLiveConfigError(
                `OpenAI Realtime is not configured. Missing: ${this.config.missingFields.join(', ') || 'unknown fields'}`,
            );
        }

        const now = this.now();
        const sessionId = randomUUID();
        const language = input.language?.trim() || this.config.defaultLanguage;
        const voice = input.voice?.trim() || this.config.defaultVoice;
        const access = this.resolveRequester(input, requester);
        const remainingDailySeconds = this.resolveRemainingDailySeconds(access, now);
        const sessionTtlSeconds = access.isPremiumActive
            ? this.config.sessionTtlSeconds
            : Math.min(this.config.sessionTtlSeconds, remainingDailySeconds);
        const clientSecret = await this.createClientSecret(language, voice, sessionTtlSeconds);

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
            userId: access.userId,
            subscriptionTier: access.subscriptionTier,
            isPremiumActive: access.isPremiumActive,
            maxDurationSeconds: sessionTtlSeconds,
            remainingDailySeconds: access.isPremiumActive ? null : remainingDailySeconds,
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
            quotaDateKey: this.getQuotaDateKey(now),
            countedUsageSeconds: 0,
        };

        this.sessions.set(sessionId, session);
        this.activeSessionByUser.set(access.userId, sessionId);
        return session;
    }

    getSession(sessionId: string, requesterUserId?: string): MascotLiveSession | null {
        const session = this.sessions.get(sessionId) ?? null;
        if (!session) {
            return null;
        }

        this.ensureSessionOwnership(session, requesterUserId);
        this.synchronizeSessionUsage(session, this.now());
        return session;
    }

    async endSession(sessionId: string, requesterUserId?: string): Promise<MascotLiveSession> {
        const existing = this.sessions.get(sessionId);
        if (!existing) {
            throw new OpenAiLiveConfigError(`Mascot live session not found: ${sessionId}`);
        }

        this.ensureSessionOwnership(existing, requesterUserId);
        this.synchronizeSessionUsage(existing, this.now(), true);
        return existing;
    }

    private async createClientSecret(
        language: string,
        voice: string,
        ttlSeconds: number,
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
                    seconds: ttlSeconds,
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

    private resolveRequester(
        input: CreateMascotLiveSessionInput,
        requester?: AuthenticatedMascotLiveUser,
    ): AuthenticatedMascotLiveUser {
        if (requester) {
            return requester;
        }

        return {
            userId: input.userId?.trim() || 'anonymous',
            subscriptionTier: 'Freemium',
            isPremiumActive: false,
            role: null,
        };
    }

    private resolveRemainingDailySeconds(access: AuthenticatedMascotLiveUser, now: Date): number {
        if (access.isPremiumActive) {
            return this.config.sessionTtlSeconds;
        }

        this.synchronizeUserActiveSession(access.userId, now);
        const activeSessionId = this.activeSessionByUser.get(access.userId);
        if (activeSessionId) {
            throw new MascotLiveSessionConflictError('Bạn đang có một phiên trò chuyện với Sumadi đang hoạt động.');
        }

        const usedSeconds = this.getCountedUsage(access.userId, this.getQuotaDateKey(now));
        const remainingSeconds = this.config.freemiumDailyLimitSeconds - usedSeconds;
        if (remainingSeconds <= 0) {
            throw new MascotLiveQuotaExceededError('Bạn đã dùng hết 5 phút trò chuyện với Sumadi hôm nay.');
        }

        return remainingSeconds;
    }

    private synchronizeUserActiveSession(userId: string, now: Date): void {
        const activeSessionId = this.activeSessionByUser.get(userId);
        if (!activeSessionId) {
            return;
        }

        const session = this.sessions.get(activeSessionId);
        if (!session) {
            this.activeSessionByUser.delete(userId);
            return;
        }

        this.synchronizeSessionUsage(session, now);
        if (session.status === 'ended') {
            this.activeSessionByUser.delete(userId);
        }
    }

    private synchronizeSessionUsage(session: MascotLiveSession, now: Date, forceEnd = false): void {
        const usedSeconds = this.computeUsedSeconds(session, now);
        const countedUsageSeconds = session.countedUsageSeconds ?? 0;
        const delta = usedSeconds - countedUsageSeconds;

        if (!session.isPremiumActive && delta > 0) {
            const usageKey = this.buildUsageKey(session.userId, session.quotaDateKey ?? this.getQuotaDateKey(now));
            this.countedUsageByUserDay.set(usageKey, this.getCountedUsage(session.userId, session.quotaDateKey ?? this.getQuotaDateKey(now)) + delta);
        }

        session.countedUsageSeconds = usedSeconds;

        if (forceEnd || usedSeconds >= session.maxDurationSeconds) {
            session.status = 'ended';
            session.endedAt = now.toISOString();
            this.activeSessionByUser.delete(session.userId);
        }

        session.remainingDailySeconds = session.isPremiumActive
            ? null
            : Math.max(0, this.config.freemiumDailyLimitSeconds - this.getCountedUsage(
                session.userId,
                session.quotaDateKey ?? this.getQuotaDateKey(now),
            ));
    }

    private computeUsedSeconds(session: MascotLiveSession, now: Date): number {
        const startedAtMs = new Date(session.createdAt).getTime();
        const endedAtMs = session.endedAt ? new Date(session.endedAt).getTime() : now.getTime();
        const elapsedSeconds = Math.max(0, Math.ceil((endedAtMs - startedAtMs) / 1000));
        return Math.min(session.maxDurationSeconds, elapsedSeconds);
    }

    private ensureSessionOwnership(session: MascotLiveSession, requesterUserId?: string): void {
        if (!requesterUserId) {
            return;
        }

        if (session.userId !== requesterUserId) {
            throw new MascotLiveForbiddenError('Bạn không có quyền truy cập phiên trò chuyện này.');
        }
    }

    private getQuotaDateKey(value: Date): string {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: this.config.quotaTimeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).formatToParts(value);
        const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
        const month = parts.find((part) => part.type === 'month')?.value ?? '00';
        const day = parts.find((part) => part.type === 'day')?.value ?? '00';
        return `${year}-${month}-${day}`;
    }

    private buildUsageKey(userId: string, quotaDateKey: string): string {
        return `${userId}:${quotaDateKey}`;
    }

    private getCountedUsage(userId: string, quotaDateKey: string): number {
        return this.countedUsageByUserDay.get(this.buildUsageKey(userId, quotaDateKey)) ?? 0;
    }
}
