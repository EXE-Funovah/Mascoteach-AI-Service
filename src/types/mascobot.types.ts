export type MascobotDeviceRole = 'eye' | 'main';
export type MascobotTurnStatus = 'queued_for_processing' | 'response_ready' | 'completed' | 'error';
export type MascobotCommandStatus = 'pending' | 'acknowledged';
export type MascobotRobotState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'tracking';
export type MascobotLiveRole = 'eye' | 'main';
export type MascobotLiveControlType =
    | 'peer_ready'
    | 'peer_waiting'
    | 'mute_input'
    | 'unmute_input'
    | 'state'
    | 'transcript'
    | 'openai_error';

export interface MascobotGatewayConfig {
    responseAudioBaseUrl?: string;
    testAudioUrl?: string;
}

export interface MascobotDeviceHeartbeatInput {
    deviceId: string;
    role: MascobotDeviceRole;
}

export interface MascobotDeviceState {
    deviceId: string;
    role: MascobotDeviceRole;
    lastSeenAt: string;
}

export interface MascobotEyeAudioInput {
    deviceId: string;
    audioBase64: string;
    contentType?: string;
    sampleRateHz?: number;
    durationMs?: number;
}

export interface MascobotAudioSummary {
    contentType: string;
    byteLength: number;
    sampleRateHz: number | null;
    durationMs: number | null;
}

export interface MascobotCommand {
    commandId: string;
    turnId: string;
    targetRole: 'main';
    type: 'set_state' | 'play_audio';
    state: MascobotRobotState;
    face: string;
    audioUrl: string | null;
    status: MascobotCommandStatus;
    createdAt: string;
    acknowledgedAt: string | null;
}

export interface MascobotTurn {
    turnId: string;
    deviceId: string;
    role: 'eye';
    status: MascobotTurnStatus;
    audio: MascobotAudioSummary;
    command: MascobotCommand;
    createdAt: string;
    updatedAt: string;
}

export interface MascobotResponseInput {
    turnId: string;
    audioUrl: string;
    face?: string;
}

export interface MascobotLivePeerConnection {
    sessionId: string;
    deviceId: string;
    role: MascobotLiveRole;
    sendText: (payload: string) => void;
    sendBinary: (payload: Buffer) => void;
}

export interface MascobotLivePeerState {
    sessionId: string;
    deviceId: string;
    role: MascobotLiveRole;
    connectedAt: string;
    lastSeenAt: string;
}

export interface MascobotLiveSessionState {
    sessionId: string;
    eye: MascobotLivePeerState | null;
    main: MascobotLivePeerState | null;
    upstreamState: 'disconnected' | 'connecting' | 'connected' | 'error';
    inputMuted: boolean;
    assistantSpeaking: boolean;
    uploadedChunks: number;
    uploadedBytes: number;
    relayedChunks: number;
    relayedBytes: number;
    lastAudioAt: string | null;
    lastAssistantAudioAt: string | null;
    lastTranscript: string | null;
}

