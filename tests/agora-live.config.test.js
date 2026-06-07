const test = require('node:test');
const assert = require('node:assert/strict');

test('Agora live config enables local RTC-only mode from env flag', () => {
    const configPath = require.resolve('../dist/config/agora-live.config.js');
    const original = {
        AGORA_APP_ID: process.env.AGORA_APP_ID,
        AGORA_APP_CERTIFICATE: process.env.AGORA_APP_CERTIFICATE,
        AGORA_CONVOAI_PIPELINE_ID: process.env.AGORA_CONVOAI_PIPELINE_ID,
        AGORA_SKIP_CONVOAI_JOIN_ON_CREATE: process.env.AGORA_SKIP_CONVOAI_JOIN_ON_CREATE,
    };

    process.env.AGORA_APP_ID = 'demo-app-id';
    process.env.AGORA_APP_CERTIFICATE = 'demo-app-cert';
    process.env.AGORA_CONVOAI_PIPELINE_ID = 'pipeline-123';
    process.env.AGORA_SKIP_CONVOAI_JOIN_ON_CREATE = 'true';

    delete require.cache[configPath];
    const { getAgoraLiveConfig } = require(configPath);
    const config = getAgoraLiveConfig();

    assert.equal(config.skipConvoAiJoinOnCreate, true);

    if (original.AGORA_APP_ID === undefined) delete process.env.AGORA_APP_ID;
    else process.env.AGORA_APP_ID = original.AGORA_APP_ID;

    if (original.AGORA_APP_CERTIFICATE === undefined) delete process.env.AGORA_APP_CERTIFICATE;
    else process.env.AGORA_APP_CERTIFICATE = original.AGORA_APP_CERTIFICATE;

    if (original.AGORA_CONVOAI_PIPELINE_ID === undefined) delete process.env.AGORA_CONVOAI_PIPELINE_ID;
    else process.env.AGORA_CONVOAI_PIPELINE_ID = original.AGORA_CONVOAI_PIPELINE_ID;

    if (original.AGORA_SKIP_CONVOAI_JOIN_ON_CREATE === undefined) delete process.env.AGORA_SKIP_CONVOAI_JOIN_ON_CREATE;
    else process.env.AGORA_SKIP_CONVOAI_JOIN_ON_CREATE = original.AGORA_SKIP_CONVOAI_JOIN_ON_CREATE;
  });
