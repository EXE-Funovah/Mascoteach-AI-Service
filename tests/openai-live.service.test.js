const test = require('node:test');
const assert = require('node:assert/strict');

const makeConfig = (overrides = {}) => ({
    provider: 'openai',
    engine: 'openai_realtime_webrtc',
    apiKey: 'test-openai-key',
    jwtKey: 'test-jwt-key',
    jwtIssuer: 'Mascoteach',
    jwtAudience: 'MascoteachClient',
    backendApiBaseUrl: 'https://api.mascoteach.test',
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
    freemiumDailyLimitSeconds: 300,
    quotaTimeZone: 'Asia/Ho_Chi_Minh',
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
        assert.equal(payload.session.audio.input.format.type, 'audio/pcm');
        assert.equal(payload.session.audio.input.format.rate, 24000);
        assert.equal(payload.session.audio.input.transcription.model, 'gpt-4o-mini-transcribe');
        assert.equal(payload.session.audio.input.turn_detection.prefix_padding_ms, 300);
        assert.equal(payload.session.audio.input.turn_detection.silence_duration_ms, 500);
        assert.equal(payload.session.audio.input.turn_detection.threshold, 0.5);
        assert.equal(payload.session.audio.output.format.type, 'audio/pcm');
        assert.equal(payload.session.audio.output.format.rate, 24000);
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
        const service = new OpenAiLiveService(makeConfig({
            botAudioSampleRateHz: 24000,
            vadPrefixPaddingMs: 300,
            vadSilenceDurationMs: 500,
            vadThreshold: 0.5,
        }));
        const created = await service.createSession({ displayName: 'Student Two' });

        assert.equal(created.status, 'created');
        assert.equal(created.clientSecret.value, 'ek_second_secret');
        assert.equal(created.clientSecret.expiresAt, '2026-06-07T00:05:00.000Z');
    } finally {
        global.fetch = originalFetch;
    }
});

test('OpenAiLiveService blocks freemium users after 5 minutes of Sumadi talk time in a day', async () => {
    const {
        OpenAiLiveService,
        MascotLiveQuotaExceededError,
    } = require('../dist/services/openai-live.service.js');

    const originalFetch = global.fetch;
    global.fetch = async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
            client_secret: {
                value: 'ek_quota_secret',
                expires_at: '2026-06-24T00:05:00.000Z',
            },
        }),
    });

    const clock = {
        current: new Date('2026-06-24T01:00:00.000Z'),
        now() {
            return new Date(this.current);
        },
    };

    try {
        const service = new OpenAiLiveService(makeConfig(), {
            now: () => clock.now(),
        });

        const firstSession = await service.createSession(
            { displayName: 'Freemium Student' },
            {
                userId: '42',
                role: 'Student',
                subscriptionTier: 'Freemium',
                isPremiumActive: false,
            },
        );

        clock.current = new Date('2026-06-24T01:03:00.000Z');
        const firstEnded = await service.endSession(firstSession.sessionId, '42');
        assert.equal(firstEnded.status, 'ended');

        const secondSession = await service.createSession(
            { displayName: 'Freemium Student' },
            {
                userId: '42',
                role: 'Student',
                subscriptionTier: 'Freemium',
                isPremiumActive: false,
            },
        );

        assert.equal(secondSession.maxDurationSeconds, 120);

        clock.current = new Date('2026-06-24T01:05:00.000Z');
        const secondEnded = await service.endSession(secondSession.sessionId, '42');
        assert.equal(secondEnded.status, 'ended');

        await assert.rejects(
            () => service.createSession(
                { displayName: 'Freemium Student' },
                {
                    userId: '42',
                    role: 'Student',
                    subscriptionTier: 'Freemium',
                    isPremiumActive: false,
                },
            ),
            (error) => {
                assert.equal(error instanceof MascotLiveQuotaExceededError, true);
                assert.equal(error.message, 'Bạn đã dùng hết 5 phút trò chuyện với Sumadi hôm nay.');
                return true;
            },
        );
    } finally {
        global.fetch = originalFetch;
    }
});
