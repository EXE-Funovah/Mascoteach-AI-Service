import { Request, Response } from 'express';
import { getMascotLiveConfig, getMascotLiveReadiness } from '../config/mascot-live.config';
import { MascotLiveAccessResolver, MascotLiveAuthConfigError, MascotLiveUnauthorizedError } from '../services/mascot-live-auth.service';
import {
    MascotLiveForbiddenError,
    MascotLiveQuotaExceededError,
    MascotLiveSessionConflictError,
    OpenAiLiveConfigError,
    OpenAiLiveService,
} from '../services/openai-live.service';

const liveConfig = getMascotLiveConfig();
const liveService = new OpenAiLiveService(liveConfig);
const liveAccessResolver = new MascotLiveAccessResolver(liveConfig);

const getSingleRouteParam = (value: string | string[] | undefined): string => {
    if (typeof value === 'string') {
        return value;
    }

    if (Array.isArray(value) && value.length > 0) {
        return value[0];
    }

    return '';
};

export const createMascotLiveSession = async (req: Request, res: Response): Promise<Response> => {
    try {
        const requester = await liveAccessResolver.resolveAuthenticatedUser(req.headers.authorization);
        const created = await liveService.createSession({
            displayName: typeof req.body?.displayName === 'string' ? req.body.displayName : undefined,
            language: typeof req.body?.language === 'string' ? req.body.language : undefined,
            voice: typeof req.body?.voice === 'string' ? req.body.voice : undefined,
        }, requester);

        return res.status(201).json({
            success: true,
            message: 'OpenAI Realtime session created.',
            data: created,
        });
    } catch (error: unknown) {
        if (error instanceof MascotLiveUnauthorizedError) {
            return res.status(401).json({
                success: false,
                message: error.message,
                data: null,
            });
        }

        if (error instanceof MascotLiveAuthConfigError) {
            return res.status(503).json({
                success: false,
                message: error.message,
                data: null,
            });
        }

        if (error instanceof MascotLiveQuotaExceededError) {
            return res.status(429).json({
                success: false,
                message: error.message,
                data: null,
            });
        }

        if (error instanceof MascotLiveSessionConflictError) {
            return res.status(409).json({
                success: false,
                message: error.message,
                data: null,
            });
        }

        if (error instanceof OpenAiLiveConfigError) {
            return res.status(502).json({
                success: false,
                message: error.message,
                data: {
                    readiness: getMascotLiveReadiness(),
                },
            });
        }

        const message = error instanceof Error ? error.message : 'Unknown mascot live error';
        return res.status(500).json({
            success: false,
            message,
            data: null,
        });
    }
};

export const getMascotLiveSession = async (req: Request, res: Response): Promise<Response> => {
    try {
        const requester = await liveAccessResolver.resolveAuthenticatedUser(req.headers.authorization);
        const session = liveService.getSession(getSingleRouteParam(req.params.sessionId), requester.userId);

        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Mascot live session not found.',
                data: null,
            });
        }

        return res.status(200).json({
            success: true,
            message: 'OpenAI Realtime session fetched.',
            data: session,
        });
    } catch (error: unknown) {
        if (error instanceof MascotLiveUnauthorizedError) {
            return res.status(401).json({
                success: false,
                message: error.message,
                data: null,
            });
        }

        if (error instanceof MascotLiveForbiddenError) {
            return res.status(403).json({
                success: false,
                message: error.message,
                data: null,
            });
        }

        if (error instanceof MascotLiveAuthConfigError) {
            return res.status(503).json({
                success: false,
                message: error.message,
                data: null,
            });
        }

        const message = error instanceof Error ? error.message : 'Unknown mascot live error';
        return res.status(500).json({
            success: false,
            message,
            data: null,
        });
    }
};

export const endMascotLiveSession = async (req: Request, res: Response): Promise<Response> => {
    try {
        const requester = await liveAccessResolver.resolveAuthenticatedUser(req.headers.authorization);
        const session = await liveService.endSession(getSingleRouteParam(req.params.sessionId), requester.userId);

        return res.status(200).json({
            success: true,
            message: 'OpenAI Realtime session ended.',
            data: session,
        });
    } catch (error: unknown) {
        if (error instanceof MascotLiveUnauthorizedError) {
            return res.status(401).json({
                success: false,
                message: error.message,
                data: null,
            });
        }

        if (error instanceof MascotLiveForbiddenError) {
            return res.status(403).json({
                success: false,
                message: error.message,
                data: null,
            });
        }

        if (error instanceof MascotLiveAuthConfigError) {
            return res.status(503).json({
                success: false,
                message: error.message,
                data: null,
            });
        }

        if (error instanceof OpenAiLiveConfigError) {
            return res.status(404).json({
                success: false,
                message: error.message,
                data: null,
            });
        }

        const message = error instanceof Error ? error.message : 'Unknown mascot live error';
        return res.status(500).json({
            success: false,
            message,
            data: null,
        });
    }
};

export const mascotLiveHealthCheck = async (req: Request, res: Response): Promise<Response> => {
    return res.status(200).json({
        success: true,
        message: 'OpenAI Realtime readiness fetched.',
        data: {
            readiness: getMascotLiveReadiness(),
        },
    });
};
