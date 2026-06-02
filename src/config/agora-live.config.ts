import { AgoraLiveReadiness, AgoraLiveRuntimeConfig } from '../types/mascot-live.types';

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

export function getAgoraLiveConfig(): AgoraLiveRuntimeConfig {
    const appId = process.env.AGORA_APP_ID?.trim();
    const appCertificate = process.env.AGORA_APP_CERTIFICATE?.trim();
    const projectId = process.env.AGORA_PROJECT_ID?.trim();
    const customerId = process.env.AGORA_CUSTOMER_ID?.trim();
    const customerSecret = process.env.AGORA_CUSTOMER_SECRET?.trim();

    const missingRtcFields: string[] = [];
    const missingLifecycleFields: string[] = [];

    if (!appId) {
        missingRtcFields.push('AGORA_APP_ID');
    }

    if (!appCertificate) {
        missingRtcFields.push('AGORA_APP_CERTIFICATE');
    }

    if (!customerId) {
        missingLifecycleFields.push('AGORA_CUSTOMER_ID');
    }

    if (!customerSecret) {
        missingLifecycleFields.push('AGORA_CUSTOMER_SECRET');
    }

    const rtcReady = missingRtcFields.length === 0;
    const lifecycleApiReady = missingLifecycleFields.length === 0;
    const missingFields = [...missingRtcFields, ...missingLifecycleFields];
    const missingConvoAiFields = [...missingFields];
    const convoAiReady = rtcReady && lifecycleApiReady;

    return {
        engine: 'native_agora_convoai',
        appId,
        appCertificate,
        projectId,
        customerId,
        customerSecret,
        convoAiBaseUrl:
            process.env.AGORA_CONVOAI_BASE_URL?.trim() ||
            'https://api.sd-rtn.com/cn/api/conversational-ai-agent/v2',
        pipelineId: process.env.AGORA_CONVOAI_PIPELINE_ID?.trim(),
        idleTimeoutSeconds: parsePositiveInt(process.env.AGORA_CONVOAI_IDLE_TIMEOUT_SECONDS, 3600),
        greetingMessage:
            process.env.AGORA_CONVOAI_GREETING_MESSAGE?.trim() ||
            'Xin chào! Mình là Sumadi đây. Chúng ta cùng học nhé!',
        tokenExpirySeconds: parsePositiveInt(process.env.AGORA_RTC_TOKEN_EXPIRY_SECONDS, 3600),
        defaultChannelPrefix: process.env.AGORA_CHANNEL_PREFIX?.trim() || 'mascot-live',
        defaultLanguage: process.env.MASCOT_LIVE_DEFAULT_LANGUAGE?.trim() || 'vi',
        defaultVoice: process.env.MASCOT_LIVE_DEFAULT_VOICE?.trim() || 'friendly',
        isConfigured: rtcReady,
        missingFields,
        rtcReady,
        lifecycleApiReady,
        convoAiReady,
        missingRtcFields,
        missingLifecycleFields,
        missingConvoAiFields,
    };
}

export function getAgoraLiveReadiness(config: AgoraLiveRuntimeConfig = getAgoraLiveConfig()): AgoraLiveReadiness {
    return {
        provider: 'agora',
        engine: config.engine,
        configured: config.isConfigured,
        rtcReady: config.rtcReady,
        lifecycleApiReady: config.lifecycleApiReady,
        convoAiReady: config.convoAiReady,
        missingFields: [...config.missingFields],
        missingRtcFields: [...config.missingRtcFields],
        missingLifecycleFields: [...config.missingLifecycleFields],
        missingConvoAiFields: [...config.missingConvoAiFields],
    };
}
