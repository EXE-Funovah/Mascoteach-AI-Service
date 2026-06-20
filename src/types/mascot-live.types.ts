export type MascotLiveProvider = 'openai';
export type MascotLiveEngine = 'openai_realtime_webrtc';

export type MascotLiveSessionStatus = 'created' | 'active' | 'ended' | 'error';

export interface MascotLiveRuntimeConfig {
    provider: MascotLiveProvider;
    engine: MascotLiveEngine;
    apiKey?: string;
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
    clientSecret: OpenAiRealtimeClientSecret;
    connection: MascotLiveConnectionInfo;
    notes: string[];
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
