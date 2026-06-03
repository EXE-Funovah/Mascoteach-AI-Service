const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('quiz generation request uses OpenAI Responses structured outputs', () => {
    const openAIServicePath = require.resolve('../dist/services/openai.service.js');
    const originalModel = process.env.OPENAI_QUIZ_MODEL;

    process.env.OPENAI_QUIZ_MODEL = '';
    delete require.cache[openAIServicePath];
    const { buildQuizResponseRequest, OPENAI_QUIZ_MODEL } = require(openAIServicePath);

    const request = buildQuizResponseRequest('Nội dung tài liệu', {
        numberOfQuestions: 3,
        language: 'vi',
    });

    assert.equal(OPENAI_QUIZ_MODEL, 'gpt-5-mini');
    assert.equal(request.model, 'gpt-5-mini');
    assert.equal(request.reasoning.effort, 'medium');
    assert.equal(request.text.format.type, 'json_schema');
    assert.equal(request.text.format.strict, true);
    assert.equal(request.text.format.schema.properties.questions.minItems, 3);
    assert.equal(request.text.format.schema.properties.questions.maxItems, 3);

    const prompt = request.input[0].content[0].text;
    assert.match(prompt, /phương án gây nhiễu hợp lý/);
    assert.match(prompt, /độ dài, mức độ chi tiết và phong cách ngữ pháp tương đương/);
    assert.match(prompt, /Đáp án đúng không được nổi bật/);
    assert.match(prompt, /hiểu lầm phổ biến của học sinh/);

    if (originalModel === undefined) {
        delete process.env.OPENAI_QUIZ_MODEL;
    } else {
        process.env.OPENAI_QUIZ_MODEL = originalModel;
    }
    delete require.cache[openAIServicePath];
});

test('Agora is the only mascot live path; no direct model WebSocket relay remains', () => {
    const root = path.resolve(__dirname, '..');
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const appSource = fs.readFileSync(path.join(root, 'src/app.ts'), 'utf8');
    const envExample = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
    const mascotTypes = fs.readFileSync(path.join(root, 'src/types/mascot-live.types.ts'), 'utf8');

    assert.equal(fs.existsSync(path.join(root, 'src/services/mascot-live.service.ts')), false);
    assert.equal(fs.existsSync(path.join(root, 'src/websocket/mascot-ws.handler.ts')), false);
    assert.equal(packageJson.dependencies.ws, undefined);
    assert.equal(packageJson.devDependencies['@types/ws'], undefined);
    assert.equal(appSource.includes('setupMascotWebSocket'), false);
    assert.equal(appSource.includes('/ws/mascot-live'), false);
    assert.equal(envExample.includes('OPENAI_REALTIME_MODEL'), false);
    assert.equal(mascotTypes.includes("'openai'"), false);
});

test('Gemini dependencies and source references are removed', () => {
    const root = path.resolve(__dirname, '..');
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

    assert.equal(packageJson.dependencies['@google/genai'], undefined);
    assert.equal(packageJson.dependencies['@google/generative-ai'], undefined);
    assert.ok(packageJson.dependencies.openai);

    const sourceFiles = [
        '.env.example',
        'src/app.ts',
        'src/controllers/ai.controller.ts',
        'src/controllers/mcq.controller.ts',
        'src/services/file-converter.service.ts',
        'src/types/mascot-live.types.ts',
    ];

    for (const relativePath of sourceFiles) {
        const content = fs.readFileSync(path.join(root, relativePath), 'utf8');
        assert.equal(/gemini/i.test(content), false, `${relativePath} still mentions Gemini`);
    }

    assert.equal(fs.existsSync(path.join(root, 'src/services/gemini.service.ts')), false);
});
