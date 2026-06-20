import { randomUUID } from 'crypto';
import {
    MascobotCommand,
    MascobotDeviceHeartbeatInput,
    MascobotDeviceState,
    MascobotEyeAudioInput,
    MascobotGatewayConfig,
    MascobotResponseInput,
    MascobotTurn,
} from '../types/mascobot.types';

export class MascobotGatewayValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MascobotGatewayValidationError';
    }
}

export class MascobotGatewayService {
    private readonly devices = new Map<string, MascobotDeviceState>();
    private readonly turns = new Map<string, MascobotTurn>();
    private readonly commands = new Map<string, MascobotCommand>();

    constructor(private readonly config: MascobotGatewayConfig = {}) {}

    heartbeat(input: MascobotDeviceHeartbeatInput): MascobotDeviceState {
        const deviceId = this.requireDeviceId(input.deviceId);
        if (input.role !== 'eye' && input.role !== 'main') {
            throw new MascobotGatewayValidationError('role must be eye or main');
        }

        const state: MascobotDeviceState = {
            deviceId,
            role: input.role,
            lastSeenAt: new Date().toISOString(),
        };

        this.devices.set(deviceId, state);
        return state;
    }

    acceptEyeAudio(input: MascobotEyeAudioInput): MascobotTurn {
        const deviceId = this.requireDeviceId(input.deviceId);
        const audioBytes = this.decodeBase64Audio(input.audioBase64);
        const now = new Date().toISOString();
        const turnId = randomUUID();
        const commandId = randomUUID();
        const audioUrl = this.config.testAudioUrl?.trim() || null;

        this.heartbeat({ deviceId, role: 'eye' });

        const command: MascobotCommand = {
            commandId,
            turnId,
            targetRole: 'main',
            type: audioUrl ? 'play_audio' : 'set_state',
            state: audioUrl ? 'speaking' : 'thinking',
            face: audioUrl ? 'speaking' : 'thinking',
            audioUrl,
            status: 'pending',
            createdAt: now,
            acknowledgedAt: null,
        };

        const turn: MascobotTurn = {
            turnId,
            deviceId,
            role: 'eye',
            status: 'queued_for_processing',
            audio: {
                contentType: input.contentType?.trim() || 'audio/wav',
                byteLength: audioBytes.byteLength,
                sampleRateHz: Number.isFinite(input.sampleRateHz) ? input.sampleRateHz as number : null,
                durationMs: Number.isFinite(input.durationMs) ? input.durationMs as number : null,
            },
            command,
            createdAt: now,
            updatedAt: now,
        };

        this.turns.set(turnId, turn);
        this.commands.set(commandId, command);
        return turn;
    }

    markResponseReady(input: MascobotResponseInput): MascobotTurn {
        const turn = this.turns.get(input.turnId);
        if (!turn) {
            throw new MascobotGatewayValidationError(`turn not found: ${input.turnId}`);
        }

        const audioUrl = input.audioUrl.trim();
        if (!audioUrl) {
            throw new MascobotGatewayValidationError('audioUrl is required');
        }

        const updatedAt = new Date().toISOString();
        const command: MascobotCommand = {
            ...turn.command,
            type: 'play_audio',
            state: 'speaking',
            face: input.face?.trim() || 'speaking',
            audioUrl,
            status: 'pending',
            acknowledgedAt: null,
        };
        const updated: MascobotTurn = {
            ...turn,
            status: 'response_ready',
            command,
            updatedAt,
        };

        this.turns.set(updated.turnId, updated);
        this.commands.set(command.commandId, command);
        return updated;
    }

    getNextMainCommand(deviceId: string): MascobotCommand | null {
        this.heartbeat({ deviceId: this.requireDeviceId(deviceId), role: 'main' });

        for (const command of this.commands.values()) {
            if (command.targetRole === 'main' && command.status === 'pending') {
                return command;
            }
        }

        return null;
    }

    ackMainCommand(deviceId: string, commandId: string): MascobotCommand {
        this.heartbeat({ deviceId: this.requireDeviceId(deviceId), role: 'main' });
        const command = this.commands.get(commandId);
        if (!command) {
            throw new MascobotGatewayValidationError(`command not found: ${commandId}`);
        }

        const acknowledged: MascobotCommand = {
            ...command,
            status: 'acknowledged',
            acknowledgedAt: new Date().toISOString(),
        };

        this.commands.set(commandId, acknowledged);
        return acknowledged;
    }

    getDevice(deviceId: string): MascobotDeviceState | null {
        return this.devices.get(deviceId) ?? null;
    }

    getTurn(turnId: string): MascobotTurn | null {
        return this.turns.get(turnId) ?? null;
    }

    getSummary() {
        return {
            devices: this.devices.size,
            turns: this.turns.size,
            pendingCommands: [...this.commands.values()].filter(command => command.status === 'pending').length,
            responseAudioBaseUrl: this.config.responseAudioBaseUrl || null,
            testAudioUrl: this.config.testAudioUrl || null,
        };
    }

    private requireDeviceId(deviceId: string): string {
        const normalized = deviceId?.trim();
        if (!normalized) {
            throw new MascobotGatewayValidationError('deviceId is required');
        }
        return normalized;
    }

    private decodeBase64Audio(audioBase64: string): Buffer {
        const normalized = audioBase64?.trim();
        if (!normalized) {
            throw new MascobotGatewayValidationError('audioBase64 is required');
        }

        if (normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
            throw new MascobotGatewayValidationError('audioBase64 must be valid base64 audio');
        }

        const decoded = Buffer.from(normalized, 'base64');
        if (decoded.byteLength === 0) {
            throw new MascobotGatewayValidationError('audioBase64 decoded to empty audio');
        }

        return decoded;
    }
}

