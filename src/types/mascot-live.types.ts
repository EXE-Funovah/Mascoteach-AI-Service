export type MascotLiveProvider = 'agora';
export type AgoraLiveEngine = 'native_agora_convoai';

export type MascotLiveSessionStatus = 'created' | 'active' | 'ended' | 'error';

export interface AgoraLiveRuntimeConfig {
    engine: AgoraLiveEngine;
    appId?: string;
    appCertificate?: string;
    projectId?: string;
    customerId?: string;
    customerSecret?: string;
    convoAiBaseUrl: string;
    pipelineId?: string;
    idleTimeoutSeconds: number;
    greetingMessage: string;
    tokenExpirySeconds: number;
    defaultChannelPrefix: string;
    defaultLanguage: string;
    defaultVoice: string;
    isConfigured: boolean;
    missingFields: string[];
    rtcReady: boolean;
    lifecycleApiReady: boolean;
    convoAiReady: boolean;
    missingRtcFields: string[];
    missingLifecycleFields: string[];
    missingConvoAiFields: string[];
}

export interface CreateMascotLiveSessionInput {
    userId?: string;
    displayName?: string;
    language?: string;
    voice?: string;
}

export interface AgoraRtcConnectionInfo {
    appId: string;
    channelName: string;
    uid: number;
    token: string | null;
    tokenExpiresAt: string | null;
}

export interface AgoraAgentSessionInfo {
    engine: AgoraLiveEngine;
    agentRtcUid: string;
    remoteRtcUids: string[];
    agentId: string | null;
    status: 'pending_backend_agent_start' | 'active' | 'ended';
    transport: 'agora_rtc';
    lifecycleApiConfigured: boolean;
    joinAttemptedAt?: string | null;
    lastError?: string | null;
    rawJoinResponse?: unknown;
    notes: string[];
}

export interface AgoraLiveSession {
    provider: 'agora';
    engine: AgoraLiveEngine;
    sessionId: string;
    status: MascotLiveSessionStatus;
    createdAt: string;
    endedAt: string | null;
    displayName: string;
    language: string;
    voice: string;
    rtc: AgoraRtcConnectionInfo;
    agent: AgoraAgentSessionInfo;
}

export interface AgoraLiveReadiness {
    provider: 'agora';
    engine: AgoraLiveEngine;
    configured: boolean;
    rtcReady: boolean;
    lifecycleApiReady: boolean;
    convoAiReady: boolean;
    missingFields: string[];
    missingRtcFields: string[];
    missingLifecycleFields: string[];
    missingConvoAiFields: string[];
}
