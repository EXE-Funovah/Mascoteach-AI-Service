const test = require('node:test');
const assert = require('node:assert/strict');

const makeConfig = (overrides = {}) => ({
    provider: 'openai',
    engine: 'openai_realtime_webrtc',
    apiKey: 'test-openai-key',
    apiBaseUrl: 'https://api.openai.com',
    realtimeModel: 'gpt-realtime-2',
    defaultLanguage: 'vi',
    defaultVoice: 'marin',
    botAudioSampleRateHz: 24000,
    inputTranscriptionModel: 'gpt-4o-mini-transcribe',
    vadPrefixPaddingMs: 300,
    vadSilenceDurationMs: 500,
    vadThreshold: 0.5,
    systemPrompt: 'Bạn là Sumadi.',
    reasoningEffort: 'low',
    maxOutputTokens: 800,
    sessionTtlSeconds: 300,
    isConfigured: true,
    missingFields: [],
    ...overrides,
});

test('OpenAiLiveService creates and tracks a live session', async () => {
    const {
        OpenAiLiveService,
        OpenAiLiveConfigError,
    } = require('../dist/services/openai-live.service.js');

    const originalFetch = global.fetch;
    global.fetch = async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
            client_secret: {
                value: 'ek_test_secret',
                expires_at: '2026-06-07T00:05:00.000Z',
            },
        }),
    });

    try {
        const service = new OpenAiLiveService(makeConfig());

        const created = await service.createSession({
            userId: 'student-1',
            displayName: 'Student One',
        });

        assert.equal(created.provider, 'openai');
        assert.equal(created.engine, 'openai_realtime_webrtc');
        assert.equal(created.model, 'gpt-realtime-2');
        assert.equal(created.clientSecret.value, 'ek_test_secret');
        assert.equal(created.connection.callEndpoint, '/v1/realtime/calls');
        assert.equal(created.connection.transport, 'webrtc');
        assert.equal(created.notes.some((note) => note.includes('WebRTC')), true);
        assert.equal(service.getSession(created.sessionId)?.sessionId, created.sessionId);

        const ended = await service.endSession(created.sessionId);
        assert.equal(ended.status, 'ended');
        assert.equal(service.getSession(created.sessionId)?.status, 'ended');

        await assert.rejects(
            () => service.endSession('missing-session'),
            OpenAiLiveConfigError,
        );
    } finally {
        global.fetch = originalFetch;
    }
});

test('OpenAiLiveService requests OpenAI client secrets with realtime session settings', async () => {
    const { OpenAiLiveService } = require('../dist/services/openai-live.service.js');

    const originalFetch = global.fetch;
    global.fetch = async (url, init) => {
        assert.equal(url, 'https://api.openai.com/v1/realtime/client_secrets');
        assert.equal(init.method, 'POST');
        assert.equal(String(init.headers.Authorization), 'Bearer test-openai-key');
        const payload = JSON.parse(init.body);

        assert.equal(payload.session.type, 'realtime');
        assert.equal(payload.session.model, 'gpt-realtime-2');
        assert.equal(payload.session.instructions, 'Bạn là Sumadi.');
        assert.equal(payload.session.reasoning.effort, 'low');
        assert.deepEqual(payload.expires_after, {
            anchor: 'created_at',
            seconds: 300,
        });
        assert.equal(payload.session.max_output_tokens, 800);
        assert.equal(payload.session.audio.output.voice, 'marin');
        assert.equal(payload.session.audio.input.turn_detection.type, 'server_vad');

        return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
                client_secret: {
                    value: 'ek_second_secret',
                    expires_at: 1780790700,
                },
            }),
        };
    };

    try {
        const service = new OpenAiLiveService(makeConfig());
        const created = await service.createSession({ displayName: 'Student Two' });

        assert.equal(created.status, 'created');
        assert.equal(created.clientSecret.value, 'ek_second_secret');
        assert.equal(created.clientSecret.expiresAt, '2026-06-07T00:05:00.000Z');
    } finally {
        global.fetch = originalFetch;
    }
});
