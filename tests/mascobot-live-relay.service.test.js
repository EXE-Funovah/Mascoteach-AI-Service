const test = require('node:test');
const assert = require('node:assert/strict');

test('MascobotLiveRelayService relays binary audio from eye to main in same session', () => {
    const { MascobotLiveRelayService } = require('../dist/services/mascobot-live-relay.service.js');

    const service = new MascobotLiveRelayService();
    const eyeMessages = [];
    const mainMessages = [];

    service.connectPeer({
        sessionId: 'live-test-01',
        deviceId: 'eye-01',
        role: 'eye',
        sendText: (payload) => eyeMessages.push(payload),
        sendBinary: () => {
            throw new Error('eye should not receive its own binary');
        },
    });

    service.connectPeer({
        sessionId: 'live-test-01',
        deviceId: 'main-01',
        role: 'main',
        sendText: (payload) => mainMessages.push(payload),
        sendBinary: (payload) => mainMessages.push(payload),
    });

    const audioChunk = Buffer.from([1, 2, 3, 4]);
    const relayed = service.relayEyeAudio('live-test-01', 'eye-01', audioChunk);

    assert.equal(relayed, true);
    assert.equal(Buffer.isBuffer(mainMessages[mainMessages.length - 1]), true);
    assert.deepEqual(mainMessages[mainMessages.length - 1], audioChunk);
    assert.equal(eyeMessages.some((message) => String(message).includes('peer_ready')), true);
});

test('MascobotLiveRelayService reports false when main peer is absent and tracks disconnect state', () => {
    const { MascobotLiveRelayService } = require('../dist/services/mascobot-live-relay.service.js');

    const service = new MascobotLiveRelayService();
    const eyeMessages = [];

    service.connectPeer({
        sessionId: 'live-test-02',
        deviceId: 'eye-01',
        role: 'eye',
        sendText: (payload) => eyeMessages.push(payload),
        sendBinary: () => {},
    });

    assert.equal(service.relayEyeAudio('live-test-02', 'eye-01', Buffer.from([9, 8])), false);

    service.disconnectPeer('live-test-02', 'eye-01', 'eye');
    const session = service.getSession('live-test-02');

    assert.equal(session, null);
    assert.equal(eyeMessages.some((message) => String(message).includes('peer_waiting')), true);
});
