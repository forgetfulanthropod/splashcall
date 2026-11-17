const assert = require('assert')
const test = require('node:test')
const {
    MODEL,
    buildChatRequest,
    createFromIdea,
    createRateLimiter,
    prepareGameHtml,
} = require('./imagine')
const { createImagineServer } = require('./imagine-server')

function listen(server) {
    return new Promise(function (resolve) {
        server.listen(0, '127.0.0.1', function () {
            resolve(server.address().port)
        })
    })
}

function close(server) {
    return new Promise(function (resolve, reject) {
        server.close(function (err) { if (err) reject(err); else resolve() })
    })
}

test('mock mode makes an object without calling xAI', async function () {
    let called = false
    const result = await createFromIdea('a red balloon', {
        apiKey: '',
        fetchImpl: function () { called = true },
        limiter: createRateLimiter(),
        ip: '10.0.0.1',
    })
    assert.equal(called, false)
    assert.equal(result.status, 200)
    assert.equal(result.body.mock, true)
    assert.equal(result.body.model, MODEL)
    assert.equal(result.body.creation.kind, 'object')
    assert.equal(result.body.creation.idle, 'bob')
    assert.equal(result.body.creation.gameHtml, '')
    assert.ok(result.body.creation.parts.length >= 3)
    assert.equal(result.body.creation.parts[1].color, '#e23d3d')
    assert.equal(JSON.stringify(result).includes('sk-'), false)
})

test('mock mode makes a playable game for a game idea', async function () {
    const result = await createFromIdea('a tapping game', {
        apiKey: '',
        limiter: createRateLimiter(),
        ip: '10.0.0.2',
    })
    assert.equal(result.status, 200)
    assert.equal(result.body.creation.kind, 'game')
    assert.equal(result.body.creation.parts.length, 0)
    const html = result.body.creation.gameHtml
    assert.ok(html.includes('Content-Security-Policy'))
    assert.ok(html.includes("connect-src 'none'"))
    assert.ok(html.includes('Tap the dot'))
    assert.ok(html.includes('id="score"'))
    assert.equal(/https?:\/\//.test(html), false)
    assert.equal(/<script\b[^>]*\bsrc\s*=/i.test(html), false)
})

test('ideas that are empty or too long are refused', async function () {
    const limiter = createRateLimiter()
    const empty = await createFromIdea('   ', { apiKey: '', limiter, ip: '10.0.0.3' })
    assert.equal(empty.status, 400)
    const huge = await createFromIdea('a'.repeat(401), { apiKey: '', limiter, ip: '10.0.0.3' })
    assert.equal(huge.status, 400)
    assert.equal(huge.body.error.includes('too long'), true)
})

test('rate limit stops a noisy caller', async function () {
    const limiter = createRateLimiter()
    let last = null
    for (let i = 0; i < 8; i++) {
        last = await createFromIdea('a blue mug', { apiKey: '', limiter, ip: '10.1.0.9' })
        assert.equal(last.status, 200)
    }
    const blocked = await createFromIdea('a blue mug', { apiKey: '', limiter, ip: '10.1.0.9' })
    assert.equal(blocked.status, 429)
    const other = await createFromIdea('a blue mug', { apiKey: '', limiter, ip: '10.1.0.10' })
    assert.equal(other.status, 200)
})

test('remote scripts are stripped and a strict CSP is added', function () {
    const html = prepareGameHtml('<script src="https://evil.example/a.js"></script><script>window.__ok = 1</script>')
    assert.ok(html.includes('Content-Security-Policy'))
    assert.ok(html.includes('window.__ok'))
    assert.equal(html.includes('evil.example'), false)
    assert.equal(html.includes('allow-same-origin'), false)
})

test('the chat request asks grok-4.7 for structured JSON and carries no key', function () {
    const body = buildChatRequest('a small frog')
    assert.equal(body.model, 'grok-4.7')
    assert.equal(body.reasoning_effort, 'low')
    assert.equal(body.response_format.type, 'json_schema')
    assert.equal(body.response_format.json_schema.strict, true)
    assert.equal(body.response_format.json_schema.schema.additionalProperties, false)
    const encoded = JSON.stringify(body)
    assert.equal(encoded.includes('Bearer'), false)
    assert.equal(encoded.includes('XAI_API_KEY'), false)
    assert.ok(body.max_tokens <= 4096)
})

test('an oversized model reply is refused and the key is not echoed', async function () {
    const secret = 'sk-test-secret-value'
    const result = await createFromIdea('a cat', {
        apiKey: secret,
        limiter: createRateLimiter(),
        ip: '10.2.0.1',
        fetchImpl: async function () {
            return {
                ok: true,
                text: async function () { return 'x'.repeat(60 * 1024) },
            }
        },
    })
    assert.equal(result.status, 413)
    assert.equal(JSON.stringify(result).includes(secret), false)
})

test('a failed xAI call does not return the key', async function () {
    const secret = 'sk-test-secret-value'
    const result = await createFromIdea('a cat', {
        apiKey: secret,
        limiter: createRateLimiter(),
        ip: '10.2.0.2',
        fetchImpl: async function () {
            throw new Error('connect ' + secret + ' refused')
        },
    })
    assert.equal(result.status, 502)
    assert.equal(JSON.stringify(result).includes(secret), false)
    assert.equal(result.body.error.includes('reach xAI'), true)
})

test('a valid model object is sanitized before it is returned', async function () {
    const payload = {
        kind: 'object',
        title: '<b>Frog</b>',
        idle: 'sway',
        background: 'green',
        parts: [
            { shape: 'circle', x: 50, y: 40, w: 30, h: 30, color: 'not-a-color', rotation: 0 },
            { shape: 'nope', x: 999, y: -4, w: 10, h: 10, color: '#123', rotation: 12 },
        ],
        gameHtml: '<script>alert(1)</script>',
    }
    const result = await createFromIdea('a frog', {
        apiKey: 'present',
        limiter: createRateLimiter(),
        ip: '10.2.0.3',
        fetchImpl: async function () {
            return {
                ok: true,
                text: async function () {
                    return JSON.stringify({
                        choices: [{ message: { content: JSON.stringify(payload) } }],
                    })
                },
            }
        },
    })
    assert.equal(result.status, 200)
    assert.equal(result.body.mock, false)
    assert.equal(result.body.creation.kind, 'object')
    assert.equal(result.body.creation.title, 'Frog')
    assert.equal(result.body.creation.gameHtml, '')
    assert.equal(result.body.creation.background, '#2faf62')
    assert.equal(result.body.creation.parts[0].color, '#888888')
    assert.equal(result.body.creation.parts[1].shape, 'ellipse')
    assert.equal(result.body.creation.parts[1].x, 100)
    assert.equal(result.body.creation.parts[1].color, '#112233')
})

test('HTTP mock server creates a toy and hides the key', async function () {
    const server = createImagineServer({ getApiKey: function () { return '' } })
    const port = await listen(server)
    try {
        const health = await fetch('http://127.0.0.1:' + port + '/api/imagine')
        const healthBody = await health.json()
        assert.equal(health.status, 200)
        assert.equal(healthBody.mock, true)
        assert.equal(healthBody.model, 'grok-4.7')
        assert.equal(JSON.stringify(healthBody).includes('key'), false)

        const created = await fetch('http://127.0.0.1:' + port + '/api/imagine', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idea: 'a red balloon' }),
        })
        const body = await created.json()
        assert.equal(created.status, 200)
        assert.equal(body.creation.kind, 'object')
        assert.equal(JSON.stringify(body).toLowerCase().includes('xai_api_key'), false)
    } finally {
        await close(server)
    }
})
