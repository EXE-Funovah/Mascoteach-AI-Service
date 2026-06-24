const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');

function encodeBase64Url(value) {
    return Buffer.from(JSON.stringify(value))
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function signJwt(payload, secret) {
    const headerPart = encodeBase64Url({ alg: 'HS256', typ: 'JWT' });
    const payloadPart = encodeBase64Url(payload);
    const content = `${headerPart}.${payloadPart}`;
    const signature = createHmac('sha256', secret)
        .update(content)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');

    return `${content}.${signature}`;
}

test('verifyMascotLiveAccessToken accepts a valid backend JWT bearer token', () => {
    const { verifyMascotLiveAccessToken } = require('../dist/services/mascot-live-auth.service.js');
    const token = signJwt(
        {
            UserId: '123',
            role: 'Student',
            iss: 'Mascoteach',
            aud: 'MascoteachClient',
            exp: Math.floor(Date.now() / 1000) + 600,
        },
        'test-jwt-key',
    );

    const claims = verifyMascotLiveAccessToken(`Bearer ${token}`, {
        jwtKey: 'test-jwt-key',
        jwtIssuer: 'Mascoteach',
        jwtAudience: 'MascoteachClient',
    });

    assert.equal(claims.userId, '123');
    assert.equal(claims.role, 'Student');
    assert.equal(claims.token, token);
});

test('verifyMascotLiveAccessToken rejects a token with a bad signature', () => {
    const {
        MascotLiveUnauthorizedError,
        verifyMascotLiveAccessToken,
    } = require('../dist/services/mascot-live-auth.service.js');
    const token = signJwt(
        {
            UserId: '123',
            iss: 'Mascoteach',
            aud: 'MascoteachClient',
            exp: Math.floor(Date.now() / 1000) + 600,
        },
        'wrong-secret',
    );

    assert.throws(
        () => verifyMascotLiveAccessToken(`Bearer ${token}`, {
            jwtKey: 'test-jwt-key',
            jwtIssuer: 'Mascoteach',
            jwtAudience: 'MascoteachClient',
        }),
        MascotLiveUnauthorizedError,
    );
});
