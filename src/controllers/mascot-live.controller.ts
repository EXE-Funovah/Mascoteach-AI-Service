import { Request, Response } from 'express';
import { getAgoraLiveConfig, getAgoraLiveReadiness } from '../config/agora-live.config';
import { AgoraLiveConfigError, AgoraLiveService } from '../services/agora-live.service';

const agoraLiveService = new AgoraLiveService(getAgoraLiveConfig());

const getSingleRouteParam = (value: string | string[] | undefined): string => {
    if (typeof value === 'string') {
        return value;
    }

    if (Array.isArray(value) && value.length > 0) {
        return value[0];
    }

    return '';
};

export const createAgoraLiveSession = async (req: Request, res: Response): Promise<Response> => {
    try {
        const created = agoraLiveService.createSession({
            userId: typeof req.body?.userId === 'string' ? req.body.userId : undefined,
            displayName: typeof req.body?.displayName === 'string' ? req.body.displayName : undefined,
            language: typeof req.body?.language === 'string' ? req.body.language : undefined,
            voice: typeof req.body?.voice === 'string' ? req.body.voice : undefined,
        });
        const session = await agoraLiveService.joinAgent(created.sessionId);

        return res.status(201).json({
            success: true,
            message: 'Agora native ConvoAI session created.',
            data: session,
        });
    } catch (error: unknown) {
        if (error instanceof AgoraLiveConfigError) {
            return res.status(502).json({
                success: false,
                message: error.message,
                data: {
                    readiness: getAgoraLiveReadiness(),
                },
            });
        }

        const message = error instanceof Error ? error.message : 'Unknown Agora live error';
        return res.status(500).json({
            success: false,
            message,
            data: null,
        });
    }
};

export const getAgoraLiveSession = async (req: Request, res: Response): Promise<Response> => {
    const session = agoraLiveService.getSession(getSingleRouteParam(req.params.sessionId));

    if (!session) {
        return res.status(404).json({
            success: false,
            message: 'Agora live session not found.',
            data: null,
        });
    }

    return res.status(200).json({
        success: true,
        message: 'Agora native ConvoAI session fetched.',
        data: session,
    });
};

export const endAgoraLiveSession = async (req: Request, res: Response): Promise<Response> => {
    try {
        const session = await agoraLiveService.endSession(getSingleRouteParam(req.params.sessionId));

        return res.status(200).json({
            success: true,
            message: 'Agora native ConvoAI session ended.',
            data: session,
        });
    } catch (error: unknown) {
        if (error instanceof AgoraLiveConfigError) {
            return res.status(404).json({
                success: false,
                message: error.message,
                data: null,
            });
        }

        const message = error instanceof Error ? error.message : 'Unknown Agora live error';
        return res.status(500).json({
            success: false,
            message,
            data: null,
        });
    }
};

export const agoraLiveHealthCheck = async (req: Request, res: Response): Promise<Response> => {
    return res.status(200).json({
        success: true,
        message: 'Agora native ConvoAI readiness fetched.',
        data: {
            readiness: getAgoraLiveReadiness(),
        },
    });
};
