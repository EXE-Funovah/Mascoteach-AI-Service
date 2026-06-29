import { Request, Response } from 'express';
import { getMascobotLiveConfig, getMascotLiveConfig, getMascotLiveReadiness } from '../config/mascot-live.config';
import { AuthenticatedMascotLiveUser, MascotLiveRuntimeConfig } from '../types/mascot-live.types';
import { MascotLiveAccessResolver, MascotLiveAuthConfigError, MascotLiveUnauthorizedError } from '../services/mascot-live-auth.service';
import {
    MascotLiveForbiddenError,
    MascotLiveQuotaExceededError,
    MascotLiveSessionConflictError,
    OpenAiLiveConfigError,
    OpenAiLiveService,
} from '../services/openai-live.service';

const getSingleRouteParam = (value: string | string[] | undefined): string => {
    if (typeof value === 'string') {
        return value;
    }

    if (Array.isArray(value) && value.length > 0) {
        return value[0];
    }

    return '';
};

const createRobotRequester = (req: Request): AuthenticatedMascotLiveUser => {
    const rawDeviceId = typeof req.body?.deviceId === 'string'
        ? req.body.deviceId
        : typeof req.query?.deviceId === 'string'
            ? req.query.deviceId
            : '';
    const deviceId = rawDeviceId.trim() || 'robot';

    return {
        userId: `mascobot:${deviceId}`,
        role: 'robot',
        subscriptionTier: 'Robot',
        isPremiumActive: true,
        premiumExpiresAt: null,
    };
};

const createMascotLiveHandlers = (
    config: MascotLiveRuntimeConfig,
    options: {
        allowAnonymousRobotAccess?: boolean;
        logLabel?: string;
    } = {},
) => {
    const liveService = new OpenAiLiveService(config);
    const liveAccessResolver = new MascotLiveAccessResolver(config);
    const logLabel = options.logLabel || 'mascot-live';
    const liveLog = (message: string, meta?: Record<string, unknown>) => {
        const suffix = meta ? ` ${JSON.stringify(meta)}` : '';
        console.log(`[${logLabel}] ${message}${suffix}`);
    };
    const resolveRequester = async (req: Request): Promise<AuthenticatedMascotLiveUser> => {
        if (options.allowAnonymousRobotAccess) {
            return createRobotRequester(req);
        }

        return liveAccessResolver.resolveAuthenticatedUser(req.headers.authorization);
    };

    return {
        createSession: async (req: Request, res: Response): Promise<Response> => {
            try {
                const requester = await resolveRequester(req);
                liveLog('createSession request', {
                    userId: requester.userId,
                    role: requester.role,
                    language: typeof req.body?.language === 'string' ? req.body.language : null,
                    voice: typeof req.body?.voice === 'string' ? req.body.voice : null,
                    displayName: typeof req.body?.displayName === 'string' ? req.body.displayName : null,
                });
                const created = await liveService.createSession({
                    displayName: typeof req.body?.displayName === 'string' ? req.body.displayName : undefined,
                    language: typeof req.body?.language === 'string' ? req.body.language : undefined,
                    voice: typeof req.body?.voice === 'string' ? req.body.voice : undefined,
                }, requester);
                liveLog('createSession success', {
                    userId: requester.userId,
                    sessionId: created.sessionId,
                    provider: created.provider,
                    engine: created.engine,
                    model: created.model,
                    language: created.language,
                    voice: created.voice,
                    maxDurationSeconds: created.maxDurationSeconds,
                });

                return res.status(201).json({
                    success: true,
                    message: 'OpenAI Realtime session created.',
                    data: created,
                });
            } catch (error: unknown) {
                liveLog('createSession error', {
                    error: error instanceof Error ? error.message : 'Unknown mascot live error',
                });
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
                            readiness: getMascotLiveReadiness(config),
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
        },
        getSession: async (req: Request, res: Response): Promise<Response> => {
            try {
                const requester = await resolveRequester(req);
                const sessionId = getSingleRouteParam(req.params.sessionId);
                liveLog('getSession request', {
                    userId: requester.userId,
                    sessionId,
                });
                const session = liveService.getSession(sessionId, requester.userId);

                if (!session) {
                    liveLog('getSession miss', {
                        userId: requester.userId,
                        sessionId,
                    });
                    return res.status(404).json({
                        success: false,
                        message: 'Mascot live session not found.',
                        data: null,
                    });
                }

                liveLog('getSession success', {
                    userId: requester.userId,
                    sessionId: session.sessionId,
                    status: session.status,
                    countedUsageSeconds: session.countedUsageSeconds,
                    remainingDailySeconds: session.remainingDailySeconds,
                });

                return res.status(200).json({
                    success: true,
                    message: 'OpenAI Realtime session fetched.',
                    data: session,
                });
            } catch (error: unknown) {
                liveLog('getSession error', {
                    error: error instanceof Error ? error.message : 'Unknown mascot live error',
                    sessionId: getSingleRouteParam(req.params.sessionId),
                });
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
        },
        endSession: async (req: Request, res: Response): Promise<Response> => {
            try {
                const requester = await resolveRequester(req);
                const sessionId = getSingleRouteParam(req.params.sessionId);
                liveLog('endSession request', {
                    userId: requester.userId,
                    sessionId,
                });
                const session = await liveService.endSession(sessionId, requester.userId);
                liveLog('endSession success', {
                    userId: requester.userId,
                    sessionId: session.sessionId,
                    status: session.status,
                    countedUsageSeconds: session.countedUsageSeconds,
                });

                return res.status(200).json({
                    success: true,
                    message: 'OpenAI Realtime session ended.',
                    data: session,
                });
            } catch (error: unknown) {
                liveLog('endSession error', {
                    error: error instanceof Error ? error.message : 'Unknown mascot live error',
                    sessionId: getSingleRouteParam(req.params.sessionId),
                });
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
        },
        healthCheck: async (_req: Request, res: Response): Promise<Response> => {
            return res.status(200).json({
                success: true,
                message: 'OpenAI Realtime readiness fetched.',
                data: {
                    readiness: getMascotLiveReadiness(config),
                },
            });
        },
    };
};

const mobileLiveHandlers = createMascotLiveHandlers(getMascotLiveConfig(), {
    logLabel: 'mobile-live',
});
const robotLiveHandlers = createMascotLiveHandlers(getMascobotLiveConfig(), {
    allowAnonymousRobotAccess: true,
    logLabel: 'robot-live-http',
});

export const createMascotLiveSession = mobileLiveHandlers.createSession;
export const getMascotLiveSession = mobileLiveHandlers.getSession;
export const endMascotLiveSession = mobileLiveHandlers.endSession;
export const mascotLiveHealthCheck = mobileLiveHandlers.healthCheck;

export const createMascobotLiveSession = robotLiveHandlers.createSession;
export const getMascobotLiveSession = robotLiveHandlers.getSession;
export const endMascobotLiveSession = robotLiveHandlers.endSession;
export const mascobotLiveHealthCheck = robotLiveHandlers.healthCheck;
