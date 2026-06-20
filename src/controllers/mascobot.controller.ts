import { Request, Response } from 'express';
import { getMascotLiveConfig, getMascotLiveReadiness } from '../config/mascot-live.config';
import { getMascobotGatewayConfig } from '../config/mascobot-gateway.config';
import { MascobotGatewayService, MascobotGatewayValidationError } from '../services/mascobot-gateway.service';
import { MascobotOpenAiRealtimeService } from '../services/mascobot-openai-realtime.service';

const gateway = new MascobotGatewayService(getMascobotGatewayConfig());
export const mascobotLiveRelay = new MascobotOpenAiRealtimeService(getMascotLiveConfig());

const bodyString = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined;
const bodyNumber = (value: unknown): number | undefined => typeof value === 'number' ? value : undefined;
const routeParam = (value: string | string[] | undefined): string => Array.isArray(value) ? value[0] || '' : value || '';

const handleError = (error: unknown, res: Response): Response => {
    if (error instanceof MascobotGatewayValidationError) {
        return res.status(400).json({
            success: false,
            message: error.message,
            data: null,
        });
    }

    const message = error instanceof Error ? error.message : 'Unknown Mascobot gateway error';
    return res.status(500).json({
        success: false,
        message,
        data: null,
    });
};

export const mascobotHealthCheck = async (_req: Request, res: Response): Promise<Response> => {
    return res.status(200).json({
        success: true,
        message: 'Mascobot gateway readiness fetched.',
        data: {
            gateway: gateway.getSummary(),
            liveRelay: mascobotLiveRelay.getSummary(),
            openaiRealtime: getMascotLiveReadiness(),
        },
    });
};

export const heartbeatMascobotDevice = async (req: Request, res: Response): Promise<Response> => {
    try {
        const device = gateway.heartbeat({
            deviceId: routeParam(req.params.deviceId),
            role: bodyString(req.body?.role) === 'main' ? 'main' : 'eye',
        });

        return res.status(200).json({
            success: true,
            message: 'Mascobot device heartbeat accepted.',
            data: device,
        });
    } catch (error: unknown) {
        return handleError(error, res);
    }
};

export const uploadMascobotEyeAudio = async (req: Request, res: Response): Promise<Response> => {
    try {
        const turn = gateway.acceptEyeAudio({
            deviceId: routeParam(req.params.deviceId) || bodyString(req.body?.deviceId) || '',
            audioBase64: bodyString(req.body?.audioBase64) || '',
            contentType: bodyString(req.body?.contentType),
            sampleRateHz: bodyNumber(req.body?.sampleRateHz),
            durationMs: bodyNumber(req.body?.durationMs),
        });

        return res.status(202).json({
            success: true,
            message: 'Mascobot eye audio accepted.',
            data: turn,
        });
    } catch (error: unknown) {
        return handleError(error, res);
    }
};

export const markMascobotResponseReady = async (req: Request, res: Response): Promise<Response> => {
    try {
        const turn = gateway.markResponseReady({
            turnId: routeParam(req.params.turnId),
            audioUrl: bodyString(req.body?.audioUrl) || '',
            face: bodyString(req.body?.face),
        });

        return res.status(200).json({
            success: true,
            message: 'Mascobot response audio queued for main ESP.',
            data: turn,
        });
    } catch (error: unknown) {
        return handleError(error, res);
    }
};

export const getMascobotMainCommand = async (req: Request, res: Response): Promise<Response> => {
    try {
        const command = gateway.getNextMainCommand(routeParam(req.params.deviceId));

        return res.status(200).json({
            success: true,
            message: command ? 'Mascobot main command fetched.' : 'No pending Mascobot command.',
            data: command,
        });
    } catch (error: unknown) {
        return handleError(error, res);
    }
};

export const ackMascobotMainCommand = async (req: Request, res: Response): Promise<Response> => {
    try {
        const command = gateway.ackMainCommand(routeParam(req.params.deviceId), routeParam(req.params.commandId));

        return res.status(200).json({
            success: true,
            message: 'Mascobot main command acknowledged.',
            data: command,
        });
    } catch (error: unknown) {
        return handleError(error, res);
    }
};

export const getMascobotDeviceState = async (req: Request, res: Response): Promise<Response> => {
    try {
        const device = gateway.getDevice(routeParam(req.params.deviceId));

        if (!device) {
            return res.status(404).json({
                success: false,
                message: 'Mascobot device not found.',
                data: null,
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Mascobot device state fetched.',
            data: device,
        });
    } catch (error: unknown) {
        return handleError(error, res);
    }
};
