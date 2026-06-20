export type MascobotLiveRole = 'eye' | 'main';

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
    relayedChunks: number;
    relayedBytes: number;
    lastAudioAt: string | null;
}

interface SessionConnectionState {
    session: MascobotLiveSessionState;
    eyeConnection: MascobotLivePeerConnection | null;
    mainConnection: MascobotLivePeerConnection | null;
}

export class MascobotLiveRelayService {
    private readonly sessions = new Map<string, SessionConnectionState>();

    connectPeer(connection: MascobotLivePeerConnection): MascobotLiveSessionState {
        const now = new Date().toISOString();
        const state = this.getOrCreate(connection.sessionId);
        const peerState: MascobotLivePeerState = {
            sessionId: connection.sessionId,
            deviceId: connection.deviceId,
            role: connection.role,
            connectedAt: now,
            lastSeenAt: now,
        };

        if (connection.role === 'eye') {
            state.eyeConnection = connection;
            state.session.eye = peerState;
        } else {
            state.mainConnection = connection;
            state.session.main = peerState;
        }

        this.notifyPeerState(state);
        return this.cloneSession(state.session);
    }

    disconnectPeer(sessionId: string, deviceId: string, role: MascobotLiveRole): MascobotLiveSessionState | null {
        const state = this.sessions.get(sessionId);
        if (!state) {
            return null;
        }

        const current = role === 'eye' ? state.session.eye : state.session.main;
        if (!current || current.deviceId !== deviceId) {
            return this.cloneSession(state.session);
        }

        if (role === 'eye') {
            state.eyeConnection = null;
            state.session.eye = null;
        } else {
            state.mainConnection = null;
            state.session.main = null;
        }

        this.notifyPeerState(state);

        if (!state.session.eye && !state.session.main) {
            this.sessions.delete(sessionId);
        }

        return this.cloneSession(state.session);
    }

    relayEyeAudio(sessionId: string, deviceId: string, payload: Buffer): boolean {
        const state = this.sessions.get(sessionId);
        if (!state?.session.eye || state.session.eye.deviceId !== deviceId) {
            return false;
        }

        state.session.eye.lastSeenAt = new Date().toISOString();
        if (!state.mainConnection || !state.session.main) {
            return false;
        }

        state.session.main.lastSeenAt = new Date().toISOString();
        state.session.relayedChunks += 1;
        state.session.relayedBytes += payload.byteLength;
        state.session.lastAudioAt = new Date().toISOString();
        state.mainConnection.sendBinary(payload);
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
                relayedChunks: 0,
                relayedBytes: 0,
                lastAudioAt: null,
            },
            eyeConnection: null,
            mainConnection: null,
        };
        this.sessions.set(sessionId, created);
        return created;
    }

    private notifyPeerState(state: SessionConnectionState) {
        const payload = JSON.stringify({
            type: state.session.eye && state.session.main ? 'peer_ready' : 'peer_waiting',
            sessionId: state.session.sessionId,
            eyeConnected: !!state.session.eye,
            mainConnected: !!state.session.main,
        });

        state.eyeConnection?.sendText(payload);
        state.mainConnection?.sendText(payload);
    }

    private cloneSession(session: MascobotLiveSessionState): MascobotLiveSessionState {
        return {
            sessionId: session.sessionId,
            eye: session.eye ? { ...session.eye } : null,
            main: session.main ? { ...session.main } : null,
            relayedChunks: session.relayedChunks,
            relayedBytes: session.relayedBytes,
            lastAudioAt: session.lastAudioAt,
        };
    }
}
