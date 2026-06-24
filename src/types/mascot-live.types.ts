export type MascotLiveProvider = 'openai';
export type MascotLiveEngine = 'openai_realtime_webrtc';

export type MascotLiveSessionStatus = 'created' | 'active' | 'ended' | 'error';

export interface MascotLiveRuntimeConfig {
    provider: MascotLiveProvider;
    engine: MascotLiveEngine;
    apiKey?: string;
    jwtKey?: string;
    jwtIssuer?: string;
    jwtAudience?: string;
    backendApiBaseUrl?: string;
    apiBaseUrl: string;
    realtimeModel: string;
    defaultLanguage: string;
    defaultVoice: string;
    botAudioSampleRateHz: number;
    inputTranscriptionModel: string;
    vadPrefixPaddingMs: number;
    vadSilenceDurationMs: number;
    vadThreshold: number;
    systemPrompt: string;
    reasoningEffort: 'low' | 'medium' | 'high';
    maxOutputTokens: number;
    sessionTtlSeconds: number;
    freemiumDailyLimitSeconds: number;
    quotaTimeZone: string;
    isConfigured: boolean;
    missingFields: string[];
}

export interface CreateMascotLiveSessionInput {
    userId?: string;
    displayName?: string;
    language?: string;
    voice?: string;
}

export interface OpenAiRealtimeClientSecret {
    value: string;
    expiresAt: string | null;
}

export interface AuthenticatedMascotLiveUser {
    userId: string;
    token?: string;
    role?: string | null;
    subscriptionTier: string;
    isPremiumActive: boolean;
    premiumExpiresAt?: string | null;
}

export interface MascotLiveConnectionInfo {
    apiBaseUrl: string;
    callEndpoint: string;
    dataChannelLabel: string;
    transport: 'webrtc';
}

export interface MascotLiveSession {
    provider: MascotLiveProvider;
    engine: MascotLiveEngine;
    sessionId: string;
    status: MascotLiveSessionStatus;
    createdAt: string;
    endedAt: string | null;
    displayName: string;
    language: string;
    voice: string;
    model: string;
    userId: string;
    subscriptionTier: string;
    isPremiumActive: boolean;
    maxDurationSeconds: number;
    remainingDailySeconds: number | null;
    clientSecret: OpenAiRealtimeClientSecret;
    connection: MascotLiveConnectionInfo;
    notes: string[];
    quotaDateKey?: string;
    countedUsageSeconds?: number;
}

export interface MascotLiveReadiness {
    provider: MascotLiveProvider;
    engine: MascotLiveEngine;
    configured: boolean;
    apiBaseUrl: string;
    model: string;
    language: string;
    voice: string;
    missingFields: string[];
}
