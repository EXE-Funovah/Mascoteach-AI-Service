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

class FakeSocket {
    constructor(url, options) {
        this.url = url;
        this.options = options;
        this.readyState = 0;
        this.sent = [];
        this.handlers = {};
        this.closedWith = null;
    }

    on(event, listener) {
        this.handlers[event] = listener;
        return this;
    }

    send(data) {
        this.sent.push(data);
    }

    close(code) {
        this.closedWith = code;
        this.readyState = 3;
    }

    emitOpen() {
        this.readyState = 1;
        this.handlers.open?.();
    }

    emitMessage(payload) {
        this.handlers.message?.(Buffer.from(JSON.stringify(payload)));
    }
}

test('MascobotOpenAiRealtimeService bridges EYE audio to OpenAI and forwards assistant audio to main', async () => {
    const { MascobotOpenAiRealtimeService } = require('../dist/services/mascobot-openai-realtime.service.js');

    const sockets = [];
    const service = new MascobotOpenAiRealtimeService(
        makeConfig(),
        (url, options) => {
            const socket = new FakeSocket(url, options);
            sockets.push(socket);
            return socket;
        },
    );

    const eyeText = [];
    const mainText = [];
    const mainBinary = [];

    service.connectPeer({
        sessionId: 'live-ai-01',
        deviceId: 'eye-01',
        role: 'eye',
        sendText: (payload) => eyeText.push(payload),
        sendBinary: () => {
            throw new Error('eye should not receive binary assistant audio');
        },
    });

    service.connectPeer({
        sessionId: 'live-ai-01',
        deviceId: 'main-01',
        role: 'main',
        sendText: (payload) => mainText.push(payload),
        sendBinary: (payload) => mainBinary.push(payload),
    });

    assert.equal(sockets.length, 1);
    assert.equal(sockets[0].url, 'wss://api.openai.com/v1/realtime?model=gpt-realtime-2');
    assert.equal(String(sockets[0].options.headers.Authorization), 'Bearer test-openai-key');

    sockets[0].emitOpen();

    const sessionUpdate = JSON.parse(sockets[0].sent[0]);
    assert.equal(sessionUpdate.type, 'session.update');
    assert.equal(sessionUpdate.session.audio.input.format.rate, 24000);
    assert.equal(sessionUpdate.session.audio.output.format.rate, 24000);
    assert.equal(sessionUpdate.session.audio.input.turn_detection.type, 'server_vad');

    const eyeAudio = Buffer.from([1, 2, 3, 4]);
    assert.equal(service.relayEyeAudio('live-ai-01', 'eye-01', eyeAudio), true);
    const appendEvent = JSON.parse(sockets[0].sent[1]);
    assert.equal(appendEvent.type, 'input_audio_buffer.append');
    assert.equal(Buffer.from(appendEvent.audio, 'base64').equals(eyeAudio), true);

    sockets[0].emitMessage({ type: 'response.created' });
    assert.equal(eyeText.some((payload) => payload.includes('"mute_input"')), true);

    const assistantChunk = Buffer.from([8, 7, 6, 5]);
    sockets[0].emitMessage({
        type: 'response.audio.delta',
        delta: assistantChunk.toString('base64'),
    });
    assert.equal(mainBinary.length, 0);

    sockets[0].emitMessage({
        type: 'conversation.item.input_audio_transcription.completed',
        transcript: 'xin chào',
    });
    const session = service.getSession('live-ai-01');
    assert.equal(session?.lastTranscript, 'xin chào');

    sockets[0].emitMessage({ type: 'response.done' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(mainBinary.length, 1);
    assert.equal(mainBinary[0].equals(assistantChunk), true);
    assert.equal(mainText.some((payload) => payload.includes('"speaking"')), true);
    assert.equal(eyeText.some((payload) => payload.includes('"unmute_input"')), true);
});

test('MascobotOpenAiRealtimeService reports config errors to peers and skips upstream connection', () => {
    const { MascobotOpenAiRealtimeService } = require('../dist/services/mascobot-openai-realtime.service.js');

    let socketCreated = false;
    const service = new MascobotOpenAiRealtimeService(
        makeConfig({
            apiKey: undefined,
            isConfigured: false,
            missingFields: ['OPENAI_API_KEY'],
        }),
        () => {
            socketCreated = true;
            return new FakeSocket('', {});
        },
    );

    const eyeText = [];
    service.connectPeer({
        sessionId: 'live-ai-02',
        deviceId: 'eye-01',
        role: 'eye',
        sendText: (payload) => eyeText.push(payload),
        sendBinary: () => {},
    });
    service.connectPeer({
        sessionId: 'live-ai-02',
        deviceId: 'main-01',
        role: 'main',
        sendText: () => {},
        sendBinary: () => {},
    });

    assert.equal(socketCreated, false);
    assert.equal(eyeText.some((payload) => payload.includes('OPENAI_API_KEY')), true);
    assert.equal(service.relayEyeAudio('live-ai-02', 'eye-01', Buffer.from([1, 2])), true);
});
