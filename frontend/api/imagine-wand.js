/**
 * Vercel route for the Voice Looper magic wand.
 * Served at /api/imagine-wand. The browser sends measurements, never audio,
 * and XAI_API_KEY stays on the server.
 */

const { createRateLimiter } = require('../server/imagine')
const { createArrangement } = require('../server/wand')
const { clientIp, readPayload } = require('../server/vercel-api')

const limiter = createRateLimiter()

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Cache-Control', 'no-store')
    const method = req.method || 'GET'
    if (method === 'OPTIONS') {
        res.status(204).end()
        return
    }
    if (method === 'GET') {
        const apiKey = (process.env.XAI_API_KEY || '').trim()
        res.status(200).json({ ok: true, mock: apiKey.length === 0 })
        return
    }
    if (method !== 'POST') {
        res.status(405).json({ error: 'Send the measurements with POST.' })
        return
    }
    const read = readPayload(req)
    if (read.error) {
        res.status(400).json({ error: 'Send the measurements as JSON.' })
        return
    }
    const result = await createArrangement(read.payload && read.payload.features, {
        apiKey: (process.env.XAI_API_KEY || '').trim(),
        limiter,
        ip: clientIp(req),
    })
    res.status(result.status).json(result.body)
}
