const test = require('node:test');
const assert = require('node:assert/strict');

test('OpenAI live config exposes realtime defaults', () => {
    const configPath = require.resolve('../dist/config/mascot-live.config.js');
    const original = {
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        OPENAI_REALTIME_MODEL: process.env.OPENAI_REALTIME_MODEL,
        OPENAI_REALTIME_VOICE: process.env.OPENAI_REALTIME_VOICE,
        OPENAI_REALTIME_REASONING_EFFORT: process.env.OPENAI_REALTIME_REASONING_EFFORT,
    };

    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.OPENAI_REALTIME_MODEL = 'gpt-realtime-2';
    process.env.OPENAI_REALTIME_VOICE = 'marin';
    process.env.OPENAI_REALTIME_REASONING_EFFORT = 'medium';

    delete require.cache[configPath];
    const { getMascotLiveConfig } = require(configPath);
    const config = getMascotLiveConfig();

    assert.equal(config.provider, 'openai');
    assert.equal(config.engine, 'openai_realtime_webrtc');
    assert.equal(config.realtimeModel, 'gpt-realtime-2');
    assert.equal(config.defaultVoice, 'marin');
    assert.equal(config.reasoningEffort, 'medium');

    for (const [key, value] of Object.entries(original)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
});
