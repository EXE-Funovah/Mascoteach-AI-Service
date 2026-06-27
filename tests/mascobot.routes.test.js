const test = require('node:test');
const assert = require('node:assert/strict');

const routeKey = (layer) => {
    const method = Object.keys(layer.route.methods)[0]?.toUpperCase() || 'GET';
    return `${method} ${layer.route.path}`;
};

test('Mascobot routes expose dedicated live session endpoints for robot clients', () => {
    const router = require('../dist/routes/mascobot.routes.js').default;
    const routes = router.stack
        .filter((layer) => layer.route)
        .map(routeKey);

    assert.equal(routes.includes('GET /live/health'), true);
    assert.equal(routes.includes('POST /live/session'), true);
    assert.equal(routes.includes('GET /live/session/:sessionId'), true);
    assert.equal(routes.includes('POST /live/session/:sessionId/end'), true);
});
