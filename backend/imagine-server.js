/**
 * Card Creator HTTP server.
 *
 * The peer program in this folder is only a signaling server. It has no
 * place to add a route, so this is a second small process. Run it beside
 * peer, or on any host the phones can reach:
 *
 *   XAI_API_KEY='...' node imagine-server.js
 *
 * Leave XAI_API_KEY unset and the server returns canned toys (mock mode).
 * The key is read from the environment only. It is never written to a
 * response, a log line, or the phone app.
 *
 * Listens on port 8787 unless IMAGINE_PORT is set.
 * Behind a reverse proxy, set TRUST_PROXY=1 so rate limits use the
 * forwarded client address.
 */

const http = require('http')
const { MODEL, createFromIdea, createRateLimiter } = require('./imagine')
const { MODEL: WORLD_MODEL, createWorldFromIdea } = require('../frontend/server/world')

const MAX_BODY = 8 * 1024

function clientIp(req) {
    if (process.env.TRUST_PROXY === '1') {
        const forwarded = req.headers['x-forwarded-for']
        if (typeof forwarded === 'string' && forwarded.trim().length > 0) {
            return forwarded.split(',')[0].trim()
        }
    }
    return (req.socket && req.socket.remoteAddress) || 'unknown'
}

function readBody(req) {
    return new Promise(function (resolve, reject) {
        const chunks = []
        let size = 0
        req.on('data', function (chunk) {
            size += chunk.length
            if (size > MAX_BODY) {
                reject(Object.assign(new Error('body too big'), { code: 'TOO_BIG' }))
                req.destroy()
                return
            }
            chunks.push(chunk)
        })
        req.on('end', function () {
            resolve(Buffer.concat(chunks).toString('utf8'))
        })
        req.on('error', reject)
    })
}

function send(res, status, body, extra) {
    const json = body == null ? '' : JSON.stringify(body)
    const headers = Object.assign({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
    }, extra || {})
    if (json.length > 0) {
        headers['Content-Type'] = 'application/json; charset=utf-8'
        headers['Content-Length'] = Buffer.byteLength(json)
    }
    res.writeHead(status, headers)
    res.end(json)
}

function createImagineServer(options) {
    const settings = options || {}
    const limiter = settings.limiter || createRateLimiter()
    const worldLimiter = settings.worldLimiter || createRateLimiter()
    const getApiKey = settings.getApiKey || function () {
        return (process.env.XAI_API_KEY || '').trim()
    }
    const fetchImpl = settings.fetchImpl

    return http.createServer(async function (req, res) {
        const url = new URL(req.url || '/', 'http://127.0.0.1')
        const worldRoute = url.pathname === '/api/imagine-world'
        const cardRoute = url.pathname === '/api/imagine'
        if (!worldRoute && !cardRoute) {
            send(res, 404, { error: 'Not found.' })
            return
        }
        if (req.method === 'OPTIONS') {
            send(res, 204, null)
            return
        }
        if (req.method === 'GET') {
            const apiKey = getApiKey()
            send(res, 200, { ok: true, mock: apiKey.length === 0, model: worldRoute ? WORLD_MODEL : MODEL })
            return
        }
        if (req.method !== 'POST') {
            send(res, 405, { error: 'Send the idea with POST.' })
            return
        }
        let raw = ''
        try {
            raw = await readBody(req)
        } catch (err) {
            if (err && err.code === 'TOO_BIG') {
                send(res, 413, { error: 'That idea is too long. Keep it to a sentence or two.' })
                return
            }
            send(res, 400, { error: 'Send the idea as JSON.' })
            return
        }
        let payload
        try {
            payload = JSON.parse(raw || '{}')
        } catch (err) {
            send(res, 400, { error: 'Send the idea as JSON.' })
            return
        }
        const idea = payload && typeof payload.idea === 'string' ? payload.idea : payload && payload.idea
        const run = worldRoute ? createWorldFromIdea : createFromIdea
        const result = await run(idea, {
            apiKey: getApiKey(),
            limiter: worldRoute ? worldLimiter : limiter,
            ip: clientIp(req),
            fetchImpl,
        })
        const extra = result.status === 429 ? { 'Retry-After': '30' } : null
        send(res, result.status, result.body, extra)
    })
}

function main() {
    const server = createImagineServer()
    const port = Number(process.env.IMAGINE_PORT || 8787)
    const host = process.env.IMAGINE_HOST || '0.0.0.0'
    server.listen(port, host, function () {
        const live = (process.env.XAI_API_KEY || '').trim().length > 0
        const mode = live ? 'live, model ' + MODEL : 'mock, XAI_API_KEY is not set'
        console.log('Card creator on http://' + host + ':' + port + '/api/imagine and /api/imagine-world (' + mode + ')')
    })
}

if (require.main === module) main()

module.exports = { createImagineServer }
