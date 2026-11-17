/**
 * Shared HTTP shape for the Vercel routes in frontend/api.
 * Same body cap, rate limits, and JSON checks as backend/imagine-server.js.
 * Vercel parses a JSON body before the function runs, so the cap is checked
 * on Content-Length and again on the bytes we can still see.
 */

const MAX_BODY = 8 * 1024

function clientIp(req) {
    const forwarded = req.headers && (req.headers['x-forwarded-for'] || req.headers['X-Forwarded-For'])
    if (typeof forwarded === 'string' && forwarded.trim().length > 0) {
        return forwarded.split(',')[0].trim()
    }
    const socket = req.socket || req.connection
    return (socket && socket.remoteAddress) || 'unknown'
}

function tooBig(req, body) {
    const header = req.headers && req.headers['content-length']
    const length = Number(header)
    if (Number.isFinite(length) && length > MAX_BODY) return true
    if (typeof body === 'string') return Buffer.byteLength(body) > MAX_BODY
    if (Buffer.isBuffer(body)) return body.length > MAX_BODY
    if (body != null && typeof body === 'object') {
        try {
            return Buffer.byteLength(JSON.stringify(body)) > MAX_BODY
        } catch (err) {
            return true
        }
    }
    return false
}

function readPayload(req) {
    const body = req.body
    if (tooBig(req, body)) return { error: 'too-big' }
    if (body == null || body === '') return { payload: {} }
    if (typeof body === 'string' || Buffer.isBuffer(body)) {
        try {
            const text = Buffer.isBuffer(body) ? body.toString('utf8') : body
            return { payload: JSON.parse(text || '{}') }
        } catch (err) {
            return { error: 'json' }
        }
    }
    if (typeof body === 'object') return { payload: body }
    return { error: 'json' }
}

function send(res, status, body, extra) {
    if (extra) {
        const keys = Object.keys(extra)
        for (let i = 0; i < keys.length; i++) res.setHeader(keys[i], extra[keys[i]])
    }
    res.status(status).json(body)
}

function createApiHandler(kind) {
    const card = kind === 'world'
    const imagine = card ? null : require('./imagine')
    const world = card ? require('./world') : null
    const limiter = card ? world.createRateLimiter() : imagine.createRateLimiter()
    const model = card ? world.MODEL : imagine.MODEL

    return async function handler(req, res) {
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
        res.setHeader('Cache-Control', 'no-store')
        res.setHeader('X-Content-Type-Options', 'nosniff')
        const method = req.method || 'GET'
        if (method === 'OPTIONS') {
            res.status(204).end()
            return
        }
        if (method === 'GET') {
            const apiKey = (process.env.XAI_API_KEY || '').trim()
            send(res, 200, { ok: true, mock: apiKey.length === 0, model })
            return
        }
        if (method !== 'POST') {
            send(res, 405, { error: 'Send the idea with POST.' })
            return
        }
        const read = readPayload(req)
        if (read.error === 'too-big') {
            send(res, 413, { error: 'That idea is too long. Keep it to a sentence or two.' })
            return
        }
        if (read.error) {
            send(res, 400, { error: 'Send the idea as JSON.' })
            return
        }
        const payload = read.payload
        const idea = payload && typeof payload.idea === 'string' ? payload.idea : payload && payload.idea
        const run = card ? world.createWorldFromIdea : imagine.createFromIdea
        const result = await run(idea, {
            apiKey: (process.env.XAI_API_KEY || '').trim(),
            limiter,
            ip: clientIp(req),
        })
        const extra = result.status === 429 ? { 'Retry-After': '30' } : null
        send(res, result.status, result.body, extra)
    }
}

module.exports = {
    MAX_BODY,
    createApiHandler,
    clientIp,
    readPayload,
}
