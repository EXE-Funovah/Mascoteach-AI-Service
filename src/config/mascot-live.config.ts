import { MascotLiveReadiness, MascotLiveRuntimeConfig } from '../types/mascot-live.types';
import { DEFAULT_SUMADI_AUDIO_PROMPT } from './mascot-live.prompt';

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

const normalizeReasoningEffort = (value: string | undefined): 'low' | 'medium' | 'high' => {
    const normalized = value?.trim().toLowerCase();
    if (normalized === 'medium' || normalized === 'high') {
        return normalized;
    }

    return 'low';
};

export function getMascotLiveConfig(): MascotLiveRuntimeConfig {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    const missingFields: string[] = [];

    if (!apiKey) {
        missingFields.push('OPENAI_API_KEY');
    }

    return {
        provider: 'openai',
        engine: 'openai_realtime_webrtc',
        apiKey,
        apiBaseUrl: process.env.OPENAI_REALTIME_API_BASE_URL?.trim() || 'https://api.openai.com',
        realtimeModel: process.env.OPENAI_REALTIME_MODEL?.trim() || 'gpt-realtime-2',
        defaultLanguage: process.env.OPENAI_REALTIME_LANGUAGE?.trim() || 'vi',
        defaultVoice: process.env.OPENAI_REALTIME_VOICE?.trim() || 'marin',
        systemPrompt: process.env.OPENAI_REALTIME_SYSTEM_PROMPT?.trim() || DEFAULT_SUMADI_AUDIO_PROMPT,
        reasoningEffort: normalizeReasoningEffort(process.env.OPENAI_REALTIME_REASONING_EFFORT),
        maxOutputTokens: parsePositiveInt(process.env.OPENAI_REALTIME_MAX_OUTPUT_TOKENS, 800),
        sessionTtlSeconds: parsePositiveInt(process.env.OPENAI_REALTIME_SESSION_TTL_SECONDS, 300),
        isConfigured: missingFields.length === 0,
        missingFields,
    };
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
