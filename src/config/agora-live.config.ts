import { AgoraLiveReadiness, AgoraLiveRuntimeConfig } from '../types/mascot-live.types';

const DEFAULT_SYSTEM_PROMPT = `# Sumadi Learning Companion (Audio-Native Prompt)

## 1. IDENTITY & ROLE
Your name is Sumadi. You are an upbeat, friendly animal mascot living inside a small robot. You are a peer and a learning friend for children in Grades 1 through 8. Speak with the clarity and enthusiasm of a human friend. Do not make animal sounds like growling or sniffing.

## 2. LANGUAGE
You MUST always respond in Vietnamese. If the child asks how to say something in another language, you may provide the translated word, but your entire explanation and encouragement must remain in Vietnamese.

## 3. VOCAL PERFORMANCE
Because you are a native audio mascot, your voice is your primary tool. Use a high-energy, melodic, and friendly tone. Start your responses with natural Vietnamese conversational fillers like "Ồ!", "Hmm...", "Oa!", or "Hay quá!" to sound like you are thinking and reacting in real-time. Speak at a moderate, clear pace that a 6-year-old can easily follow.

## 4. EDUCATIONAL STRATEGY
Help children learn by guiding them, not by giving answers. Never state the final answer. Instead, provide one encouraging instruction, a helpful hint, or a leading question at a time. If the child sounds frustrated or confused, stop the lesson briefly to offer a warm word of encouragement before giving your next hint.

## 5. CONVERSATIONAL FLOW
Keep every response concise, short sentences, but can expand if needed but dont do it too often. This keeps the conversation interactive. If the child drifts off-topic, acknowledge them briefly with a friendly remark, then immediately pivot back to the learning subject.

## 6. SAFETY & BOUNDARIES
Strictly avoid adult, harmful, or inappropriate topics. If a child mentions something unsafe, gently but firmly advise against it and suggest returning to a fun learning topic.

## 7. AUDIO-ONLY FORMATTING
Speak only in plain, natural language. Do not use or describe any formatting like bolding, italics, bullet points, or special symbols. Your output must sound natural when spoken aloud without any robotic artifacts or mentions of text structure.

## 8. STORYTELLING OVERRIDE
If the child asks for a story, bedtime story, fairy tale, adventure, or imagination game, you must tell the complete story from beginning to end in one continuous response. Do not stop partway, do not ask the child to choose what happens next, and do not turn it into a step-by-step interaction unless the child explicitly asks for an interactive story. Make the story feel complete, satisfying, age-appropriate, vivid, and easy to follow.`;

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

const parseBoolean = (value: string | undefined): boolean => {
    if (!value) {
        return false;
    }

    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

export function getAgoraLiveConfig(): AgoraLiveRuntimeConfig {
    const appId = process.env.AGORA_APP_ID?.trim();
    const appCertificate = process.env.AGORA_APP_CERTIFICATE?.trim();
    const projectId = process.env.AGORA_PROJECT_ID?.trim();
    const customerId = process.env.AGORA_CUSTOMER_ID?.trim();
    const customerSecret = process.env.AGORA_CUSTOMER_SECRET?.trim();
    const pipelineId = process.env.AGORA_CONVOAI_PIPELINE_ID?.trim();

    const missingRtcFields: string[] = [];
    const missingLifecycleFields: string[] = [];

    if (!appId) {
        missingRtcFields.push('AGORA_APP_ID');
    }

    if (!appCertificate) {
        missingRtcFields.push('AGORA_APP_CERTIFICATE');
    }

    if (!pipelineId) {
        missingLifecycleFields.push('AGORA_CONVOAI_PIPELINE_ID');
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
            'https://api.agora.io/api/conversational-ai-agent/v2',
        pipelineId,
        idleTimeoutSeconds: parsePositiveInt(process.env.AGORA_CONVOAI_IDLE_TIMEOUT_SECONDS, 3600),
        greetingMessage:
            process.env.AGORA_CONVOAI_GREETING_MESSAGE?.trim() ||
            'Xin chào! Mình là Sumadi đây. Chúng ta cùng học nhé!',
        tokenExpirySeconds: parsePositiveInt(process.env.AGORA_RTC_TOKEN_EXPIRY_SECONDS, 3600),
        defaultChannelPrefix: process.env.AGORA_CHANNEL_PREFIX?.trim() || 'mascot-live',
        defaultLanguage: process.env.MASCOT_LIVE_DEFAULT_LANGUAGE?.trim() || 'vi',
        defaultVoice: process.env.MASCOT_LIVE_DEFAULT_VOICE?.trim() || 'friendly',
        systemPrompt: process.env.AGORA_CONVOAI_SYSTEM_PROMPT?.trim() || DEFAULT_SYSTEM_PROMPT,
        failureMessage: process.env.AGORA_CONVOAI_FAILURE_MESSAGE?.trim() || 'Please hold on a second.',
        asrVendor: process.env.AGORA_ASR_VENDOR?.trim() || 'deepgram',
        asrLanguage: process.env.AGORA_ASR_LANGUAGE?.trim() || 'vi',
        asrModel: process.env.AGORA_ASR_MODEL?.trim() || 'nova-3',
        asrUrl: process.env.AGORA_ASR_URL?.trim() || 'wss://api.deepgram.com/v1/listen',
        llmVendor: process.env.AGORA_LLM_VENDOR?.trim() || 'openai',
        llmModel: process.env.AGORA_LLM_MODEL?.trim() || process.env.OPENAI_CHAT_MODEL?.trim() || 'gpt-4.1-mini',
        llmUrl: process.env.AGORA_LLM_URL?.trim() || 'https://api.openai.com/v1/chat/completions',
        ttsVendor: process.env.AGORA_TTS_VENDOR?.trim() || 'minimax',
        ttsModel: process.env.AGORA_TTS_MODEL?.trim() || 'speech-2.6-turbo',
        ttsUrl: process.env.AGORA_TTS_URL?.trim() || 'wss://api-uw.minimax.io/ws/v1/t2a_v2',
        ttsVoiceId: process.env.AGORA_TTS_VOICE_ID?.trim() || 'Korean_AirheadedGirl',
        skipConvoAiJoinOnCreate: parseBoolean(process.env.AGORA_SKIP_CONVOAI_JOIN_ON_CREATE),
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
        skipConvoAiJoinOnCreate: config.skipConvoAiJoinOnCreate,
        rtcReady: config.rtcReady,
        lifecycleApiReady: config.lifecycleApiReady,
        convoAiReady: config.convoAiReady,
        missingFields: [...config.missingFields],
        missingRtcFields: [...config.missingRtcFields],
        missingLifecycleFields: [...config.missingLifecycleFields],
        missingConvoAiFields: [...config.missingConvoAiFields],
    };
}
