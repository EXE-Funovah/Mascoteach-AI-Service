const test = require('node:test');
const assert = require('node:assert/strict');

test('OpenAI live config exposes realtime defaults', () => {
    const configPath = require.resolve('../dist/config/mascot-live.config.js');
    const original = {
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        OPENAI_REALTIME_MODEL: process.env.OPENAI_REALTIME_MODEL,
        OPENAI_REALTIME_VOICE: process.env.OPENAI_REALTIME_VOICE,
        OPENAI_REALTIME_REASONING_EFFORT: process.env.OPENAI_REALTIME_REASONING_EFFORT,
        OPENAI_REALTIME_AUDIO_SAMPLE_RATE_HZ: process.env.OPENAI_REALTIME_AUDIO_SAMPLE_RATE_HZ,
        OPENAI_REALTIME_VAD_PREFIX_PADDING_MS: process.env.OPENAI_REALTIME_VAD_PREFIX_PADDING_MS,
        OPENAI_REALTIME_VAD_SILENCE_DURATION_MS: process.env.OPENAI_REALTIME_VAD_SILENCE_DURATION_MS,
        OPENAI_REALTIME_VAD_THRESHOLD: process.env.OPENAI_REALTIME_VAD_THRESHOLD,
    };

    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.OPENAI_REALTIME_MODEL = 'gpt-realtime-2';
    process.env.OPENAI_REALTIME_VOICE = 'marin';
    process.env.OPENAI_REALTIME_REASONING_EFFORT = 'medium';
    process.env.OPENAI_REALTIME_AUDIO_SAMPLE_RATE_HZ = '24000';
    process.env.OPENAI_REALTIME_VAD_PREFIX_PADDING_MS = '300';
    process.env.OPENAI_REALTIME_VAD_SILENCE_DURATION_MS = '500';
    process.env.OPENAI_REALTIME_VAD_THRESHOLD = '0.5';

    delete require.cache[configPath];
    const {
        getMascotLiveConfig,
        getMascobotLiveConfig,
    } = require(configPath);
    const config = getMascotLiveConfig();
    const robotConfig = getMascobotLiveConfig();

    assert.equal(config.provider, 'openai');
    assert.equal(config.engine, 'openai_realtime_webrtc');
    assert.equal(config.realtimeModel, 'gpt-realtime-2');
    assert.equal(config.defaultVoice, 'marin');
    assert.equal(config.reasoningEffort, 'medium');
    assert.equal(config.realtimeModel, robotConfig.realtimeModel);
    assert.equal(config.reasoningEffort, robotConfig.reasoningEffort);
    assert.equal(config.maxOutputTokens, robotConfig.maxOutputTokens);
    assert.equal(config.botAudioSampleRateHz, 24000);
    assert.equal(config.vadPrefixPaddingMs, 300);
    assert.equal(config.vadSilenceDurationMs, 500);
    assert.equal(config.vadThreshold, 0.5);
    assert.equal(robotConfig.botAudioSampleRateHz, 24000);
    assert.equal(robotConfig.vadPrefixPaddingMs, 300);
    assert.equal(robotConfig.vadSilenceDurationMs, 500);
    assert.equal(robotConfig.vadThreshold, 0.5);

    for (const [key, value] of Object.entries(original)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
});
