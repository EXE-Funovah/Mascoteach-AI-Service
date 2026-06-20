const test = require('node:test');
const assert = require('node:assert/strict');

test('MascobotGatewayService accepts S3-EYE audio and queues a main ESP command', () => {
    const { MascobotGatewayService } = require('../dist/services/mascobot-gateway.service.js');

    const service = new MascobotGatewayService({
        responseAudioBaseUrl: 'http://localhost:5001/api/v1/mascobot/audio',
        testAudioUrl: 'http://localhost:5001/test-response.wav',
    });

    const accepted = service.acceptEyeAudio({
        deviceId: 'eye-01',
        audioBase64: Buffer.from('fake wav bytes').toString('base64'),
        contentType: 'audio/wav',
        sampleRateHz: 16000,
        durationMs: 1200,
    });

    assert.equal(accepted.deviceId, 'eye-01');
    assert.equal(accepted.role, 'eye');
    assert.equal(accepted.status, 'queued_for_processing');
    assert.equal(accepted.audio.contentType, 'audio/wav');
    assert.equal(accepted.audio.byteLength, 14);
    assert.equal(accepted.command.type, 'play_audio');
    assert.equal(accepted.command.targetRole, 'main');
    assert.equal(accepted.command.state, 'speaking');
    assert.equal(accepted.command.audioUrl, 'http://localhost:5001/test-response.wav');

    const nextCommand = service.getNextMainCommand('main-01');

    assert.equal(nextCommand?.commandId, accepted.command.commandId);
    assert.equal(nextCommand?.turnId, accepted.turnId);
});

test('MascobotGatewayService validates audio upload input and command ack flow', () => {
    const { MascobotGatewayService, MascobotGatewayValidationError } = require('../dist/services/mascobot-gateway.service.js');

    const service = new MascobotGatewayService();

    assert.throws(
        () => service.acceptEyeAudio({
            deviceId: '',
            audioBase64: Buffer.from('x').toString('base64'),
        }),
        MascobotGatewayValidationError,
    );

    assert.throws(
        () => service.acceptEyeAudio({
            deviceId: 'eye-01',
            audioBase64: 'not-base64%%%!',
        }),
        MascobotGatewayValidationError,
    );

    const accepted = service.acceptEyeAudio({
        deviceId: 'eye-01',
        audioBase64: Buffer.from('voice').toString('base64'),
        contentType: 'audio/wav',
    });

    assert.equal(service.ackMainCommand('main-01', accepted.command.commandId).status, 'acknowledged');
    assert.equal(service.getNextMainCommand('main-01'), null);
});
