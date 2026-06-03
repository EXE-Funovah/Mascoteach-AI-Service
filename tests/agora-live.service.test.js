const test = require('node:test');
const assert = require('node:assert/strict');

test('AgoraLiveService creates and tracks a live session', async () => {
    const {
        AgoraLiveService,
        AgoraLiveConfigError,
    } = require('../dist/services/agora-live.service.js');

    const service = new AgoraLiveService({
        engine: 'native_agora_convoai',
        appId: 'demo-app-id',
        appCertificate: undefined,
        projectId: undefined,
        customerId: undefined,
        customerSecret: undefined,
        convoAiBaseUrl: 'https://api.sd-rtn.com/cn/api/conversational-ai-agent/v2',
        pipelineId: undefined,
        idleTimeoutSeconds: 3600,
        greetingMessage: 'Xin chào!',
        tokenExpirySeconds: 600,
        defaultChannelPrefix: 'mascot-live',
        defaultLanguage: 'vi',
        defaultVoice: 'friendly',
        isConfigured: true,
        missingFields: [],
        rtcReady: true,
        lifecycleApiReady: false,
        convoAiReady: false,
        missingRtcFields: [],
        missingLifecycleFields: [],
        missingConvoAiFields: [],
    });

    const created = service.createSession({
        userId: 'student-1',
        displayName: 'Student One',
    });

    assert.equal(created.provider, 'agora');
    assert.equal(created.engine, 'native_agora_convoai');
    assert.equal(created.rtc.appId, 'demo-app-id');
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

test('AgoraLiveService joins native ConvoAI and stores agent id', async () => {
    const { AgoraLiveService } = require('../dist/services/agora-live.service.js');

    const originalFetch = global.fetch;
    global.fetch = async (url, init) => {
        assert.equal(url, 'https://api.sd-rtn.com/cn/api/conversational-ai-agent/v2/projects/demo-app-id/join');
        assert.equal(init.method, 'POST');
        assert.equal(String(init.headers.Authorization).startsWith('Basic '), true);
        const payload = JSON.parse(init.body);
        assert.equal(payload.enable_string_uid, false);
        assert.equal(typeof payload.agent_rtc_uid, 'string');
        assert.equal(Array.isArray(payload.remote_rtc_uids), true);

        return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ agent_id: 'agent-123' }),
        };
    };

    try {
        const service = new AgoraLiveService({
            engine: 'native_agora_convoai',
            appId: 'demo-app-id',
            appCertificate: 'demo-app-cert',
            projectId: undefined,
            customerId: 'customer-id',
            customerSecret: 'customer-secret',
            convoAiBaseUrl: 'https://api.sd-rtn.com/cn/api/conversational-ai-agent/v2',
            pipelineId: undefined,
            idleTimeoutSeconds: 3600,
            greetingMessage: 'Xin chào!',
            tokenExpirySeconds: 600,
            defaultChannelPrefix: 'mascot-live',
            defaultLanguage: 'vi',
            defaultVoice: 'friendly',
            isConfigured: true,
            missingFields: [],
            rtcReady: true,
            lifecycleApiReady: true,
            convoAiReady: true,
            missingRtcFields: [],
            missingLifecycleFields: [],
            missingConvoAiFields: [],
        });

        const created = service.createSession({ displayName: 'Student Two' });
        const joined = await service.joinAgent(created.sessionId);

        assert.equal(joined.status, 'active');
        assert.equal(joined.agent.agentId, 'agent-123');
        assert.equal(joined.agent.status, 'active');
    } finally {
        global.fetch = originalFetch;
    }
});
