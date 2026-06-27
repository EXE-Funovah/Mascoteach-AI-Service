import { MascotLiveReadiness, MascotLiveRuntimeConfig } from '../types/mascot-live.types';
import { DEFAULT_SUMADI_AUDIO_PROMPT } from './mascot-live.prompt';

type MascotLiveProfile = 'mobile' | 'robot';

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
    if (!value) {
        return fallback;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }

    return parsed;
};

const parseThreshold = (value: string | undefined, fallback: number): number => {
    if (!value) {
        return fallback;
    }

    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }

    return Math.min(1, Math.max(0, parsed));
};

const normalizeReasoningEffort = (value: string | undefined): 'low' | 'medium' | 'high' => {
    const normalized = value?.trim().toLowerCase();
    if (normalized === 'medium' || normalized === 'high') {
        return normalized;
    }

    return 'low';
};

const buildBaseConfig = (): Omit<
    MascotLiveRuntimeConfig,
    'botAudioSampleRateHz' | 'vadPrefixPaddingMs' | 'vadSilenceDurationMs' | 'vadThreshold'
> => {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    const missingFields: string[] = [];

    if (!apiKey) {
        missingFields.push('OPENAI_API_KEY');
    }

    return {
        provider: 'openai',
        engine: 'openai_realtime_webrtc',
        apiKey,
        jwtKey: process.env.JWT_KEY?.trim(),
        jwtIssuer: process.env.JWT_ISSUER?.trim(),
        jwtAudience: process.env.JWT_AUDIENCE?.trim(),
        backendApiBaseUrl:
            process.env.MASCOTEACH_BACKEND_API_BASE_URL?.trim()
            || process.env.BACKEND_API_BASE_URL?.trim()
            || undefined,
        apiBaseUrl: process.env.OPENAI_REALTIME_API_BASE_URL?.trim() || 'https://api.openai.com',
        realtimeModel: process.env.OPENAI_REALTIME_MODEL?.trim() || 'gpt-realtime-2',
        defaultLanguage: process.env.OPENAI_REALTIME_LANGUAGE?.trim() || 'vi',
        defaultVoice: process.env.OPENAI_REALTIME_VOICE?.trim() || 'marin',
        inputTranscriptionModel:
            process.env.OPENAI_REALTIME_INPUT_TRANSCRIPTION_MODEL?.trim() || 'gpt-4o-mini-transcribe',
        systemPrompt: process.env.OPENAI_REALTIME_SYSTEM_PROMPT?.trim() || DEFAULT_SUMADI_AUDIO_PROMPT,
        reasoningEffort: normalizeReasoningEffort(process.env.OPENAI_REALTIME_REASONING_EFFORT),
        maxOutputTokens: parsePositiveInt(process.env.OPENAI_REALTIME_MAX_OUTPUT_TOKENS, 800),
        sessionTtlSeconds: parsePositiveInt(process.env.OPENAI_REALTIME_SESSION_TTL_SECONDS, 300),
        freemiumDailyLimitSeconds: parsePositiveInt(process.env.MASCOT_LIVE_FREEMIUM_DAILY_LIMIT_SECONDS, 300),
        quotaTimeZone: process.env.MASCOT_LIVE_QUOTA_TIME_ZONE?.trim() || 'Asia/Ho_Chi_Minh',
        isConfigured: missingFields.length === 0,
        missingFields,
    };
};

const buildAudioProfile = (
    profile: MascotLiveProfile,
): Pick<MascotLiveRuntimeConfig, 'botAudioSampleRateHz' | 'vadPrefixPaddingMs' | 'vadSilenceDurationMs' | 'vadThreshold'> => {
    if (profile === 'robot') {
        return {
            botAudioSampleRateHz: parsePositiveInt(process.env.OPENAI_REALTIME_AUDIO_SAMPLE_RATE_HZ, 24000),
            vadPrefixPaddingMs: parsePositiveInt(process.env.OPENAI_REALTIME_VAD_PREFIX_PADDING_MS, 300),
            vadSilenceDurationMs: parsePositiveInt(process.env.OPENAI_REALTIME_VAD_SILENCE_DURATION_MS, 500),
            vadThreshold: parseThreshold(process.env.OPENAI_REALTIME_VAD_THRESHOLD, 0.5),
        };
    }

    return {
        botAudioSampleRateHz: 24000,
        vadPrefixPaddingMs: 300,
        vadSilenceDurationMs: 500,
        vadThreshold: 0.5,
    };
};

const buildMascotLiveConfig = (profile: MascotLiveProfile): MascotLiveRuntimeConfig => {
    return {
        ...buildBaseConfig(),
        ...buildAudioProfile(profile),
    };
};

export function getMascotLiveConfig(): MascotLiveRuntimeConfig {
    return buildMascotLiveConfig('mobile');
}

export function getMascobotLiveConfig(): MascotLiveRuntimeConfig {
    return buildMascotLiveConfig('robot');
}

export function getMascotLiveReadiness(
    config: MascotLiveRuntimeConfig = getMascotLiveConfig(),
): MascotLiveReadiness {
    return {
        provider: config.provider,
        engine: config.engine,
        configured: config.isConfigured,
        apiBaseUrl: config.apiBaseUrl,
        model: config.realtimeModel,
        language: config.defaultLanguage,
        voice: config.defaultVoice,
        missingFields: [...config.missingFields],
    };
}
