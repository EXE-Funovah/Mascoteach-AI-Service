const test = require('node:test');
const assert = require('node:assert/strict');

const createMockResponse = () => {
    return {
        statusCode: 200,
        body: undefined,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
    };
};

const loadControllerModule = () => {
    const modulesToClear = [
        '../dist/controllers/mascot-live.controller.js',
        '../dist/config/mascot-live.config.js',
    ];
    for (const modulePath of modulesToClear) {
        delete require.cache[require.resolve(modulePath)];
    }

    return require('../dist/controllers/mascot-live.controller.js');
};

test('createMascobotLiveSession does not require Authorization header', async () => {
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const { createMascobotLiveSession } = loadControllerModule();
    const req = {
        body: {
            deviceId: 'eye-01',
            displayName: 'Robot tester',
        },
        params: {},
        query: {},
        headers: {},
    };
    const res = createMockResponse();

    await createMascobotLiveSession(req, res);

    assert.equal(res.statusCode, 502);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /OpenAI Realtime is not configured/i);

    if (previousOpenAiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
    } else {
        process.env.OPENAI_API_KEY = previousOpenAiKey;
    }
});

test('createMascotLiveSession still requires Authorization header', async () => {
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const { createMascotLiveSession } = loadControllerModule();
    const req = {
        body: {},
        params: {},
        query: {},
        headers: {},
    };
    const res = createMockResponse();

    await createMascotLiveSession(req, res);

    assert.equal(res.statusCode, 401);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /đăng nhập/i);

    if (previousOpenAiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
    } else {
        process.env.OPENAI_API_KEY = previousOpenAiKey;
    }
});
