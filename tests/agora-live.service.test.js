const test = require('node:test');
const assert = require('node:assert/strict');

const makeConfig = (overrides = {}) => ({
    engine: 'native_agora_convoai',
    appId: '5b175131dd5a4287a0fd83fbed773b06',
    appCertificate: 'f1fe14f2166f46e782b36509adb5224d',
    projectId: undefined,
    customerId: 'customer-id',
    customerSecret: 'customer-secret',
    convoAiBaseUrl: 'https://api.agora.io/api/conversational-ai-agent/v2',
    pipelineId: 'pipeline-123',
    idleTimeoutSeconds: 3600,
    greetingMessage: 'Xin chào!',
    tokenExpirySeconds: 600,
    defaultChannelPrefix: 'mascot-live',
    defaultLanguage: 'vi',
    defaultVoice: 'friendly',
    systemPrompt: 'Bạn là Sumadi.',
    failureMessage: 'Please hold on a second.',
    asrVendor: 'deepgram',
    asrLanguage: 'vi',
    asrModel: 'nova-3',
    asrUrl: 'wss://api.deepgram.com/v1/listen',
    llmVendor: 'openai',
    llmModel: 'gpt-4.1-mini',
    llmUrl: 'https://api.openai.com/v1/chat/completions',
    ttsVendor: 'minimax',
    ttsModel: 'speech-2.6-turbo',
    ttsUrl: 'wss://api-uw.minimax.io/ws/v1/t2a_v2',
    ttsVoiceId: 'Korean_AirheadedGirl',
    skipConvoAiJoinOnCreate: false,
    isConfigured: true,
    missingFields: [],
    rtcReady: true,
    lifecycleApiReady: true,
    convoAiReady: true,
    missingRtcFields: [],
    missingLifecycleFields: [],
    missingConvoAiFields: [],
    ...overrides,
});

test('AgoraLiveService creates and tracks a live session', async () => {
    const {
        AgoraLiveService,
        AgoraLiveConfigError,
    } = require('../dist/services/agora-live.service.js');

    const service = new AgoraLiveService(
        makeConfig({
            customerId: undefined,
            customerSecret: undefined,
            lifecycleApiReady: false,
            convoAiReady: false,
        }),
    );

    const created = service.createSession({
        userId: 'student-1',
        displayName: 'Student One',
    });

    assert.equal(created.provider, 'agora');
    assert.equal(created.engine, 'native_agora_convoai');
    assert.equal(created.rtc.appId, '5b175131dd5a4287a0fd83fbed773b06');
    assert.equal(created.rtc.channelName.startsWith('mascot-live-'), true);
    assert.equal(Number.isInteger(created.rtc.uid), true);
    assert.equal(created.agent.status, 'pending_backend_agent_start');
    assert.equal(created.agent.engine, 'native_agora_convoai');
    assert.equal(created.agent.lifecycleApiConfigured, false);
    assert.equal(created.agent.notes.some((note) => note.includes('OpenAI')), false);
    assert.equal(service.getSession(created.sessionId)?.sessionId, created.sessionId);

    const ended = await service.endSession(created.sessionId);
    assert.equal(ended.status, 'ended');
    assert.equal(service.getSession(created.sessionId)?.status, 'ended');

    await assert.rejects(
        () => service.endSession('missing-session'),
        AgoraLiveConfigError,
    );
});

test('AgoraLiveService joins native ConvoAI using the exported full request shape', async () => {
    const { AgoraLiveService } = require('../dist/services/agora-live.service.js');

    const originalFetch = global.fetch;
    global.fetch = async (url, init) => {
        assert.equal(url, 'https://api.agora.io/api/conversational-ai-agent/v2/projects/5b175131dd5a4287a0fd83fbed773b06/join');
        assert.equal(init.method, 'POST');
        const payload = JSON.parse(init.body);

        assert.equal(typeof payload.name, 'string');
        assert.equal(payload.pipeline_id, 'pipeline-123');
        assert.equal(payload.properties.enable_string_uid, false);
        assert.equal(typeof payload.properties.agent_rtc_uid, 'string');
        assert.deepEqual(payload.properties.remote_rtc_uids, ['*']);
        assert.equal(payload.properties.channel.startsWith('mascot-live-'), true);
        assert.equal(payload.properties.asr.vendor, 'deepgram');
        assert.equal(payload.properties.asr.language, 'vi');
        assert.equal(payload.properties.asr.params.model, 'nova-3');
        assert.equal(payload.properties.llm.vendor, 'openai');
        assert.equal(payload.properties.llm.params.model, 'gpt-4.1-mini');
        assert.equal(payload.properties.llm.system_messages[0].role, 'system');
        assert.match(payload.properties.llm.system_messages[0].content, /Sumadi/);
        assert.equal(payload.properties.tts.vendor, 'minimax');
        assert.equal(payload.properties.tts.params.model, 'speech-2.6-turbo');
        assert.equal(payload.properties.tts.params.voice_setting.voice_id, 'Korean_AirheadedGirl');
        assert.equal(typeof payload.properties.token, 'string');
        assert.equal(String(init.headers.Authorization), `agora token=${payload.properties.token}`);

        return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ agent_id: 'agent-123' }),
        };
    };

    try {
        const service = new AgoraLiveService(makeConfig());

        const created = service.createSession({ displayName: 'Student Two' });
        const joined = await service.joinAgent(created.sessionId);

        assert.equal(joined.status, 'active');
        assert.equal(joined.agent.agentId, 'agent-123');
        assert.equal(joined.agent.status, 'active');
    } finally {
        global.fetch = originalFetch;
    }
});
