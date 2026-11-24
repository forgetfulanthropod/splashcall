/**
 * Ask xAI for an arrangement around a recording's measured features.
 * The key is passed in. Raw audio never comes here.
 */

const { createRateLimiter } = require('./imagine')
const { buildWandRequest, practiceArrangement, sanitizeArrangement, wandFailureMessage } = require('../src/cards/voice-looper/wand')

const MODEL = 'grok-4.7'

function scrub(message, apiKey) {
    const text = String(message || '')
    if (!apiKey) return text
    return text.split(apiKey).join('[redacted]')
}

async function createArrangement(features, options) {
    const settings = options || {}
    const apiKey = typeof settings.apiKey === 'string' ? settings.apiKey.trim() : ''
    const limiter = settings.limiter
    const ip = settings.ip || 'unknown'
    if (limiter && !limiter.allow(ip)) {
        return { status: 429, body: { error: 'The creator is busy. Wait a moment and try again.' } }
    }
    if (features == null || typeof features !== 'object') {
        return { status: 400, body: { error: 'Send the recording measurements as JSON.' } }
    }
    if (!apiKey) {
        return { status: 200, body: { arrangement: practiceArrangement(features), mock: true, model: MODEL } }
    }
    const fetchFn = settings.fetchImpl || globalThis.fetch
    let response
    try {
        response = await fetchFn('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + apiKey,
            },
            body: JSON.stringify(buildWandRequest(features)),
        })
    } catch (err) {
        console.error('imagine-wand failed', scrub(err && err.message, apiKey))
        return { status: 502, body: { error: wandFailureMessage(502) } }
    }
    if (response.status === 403) {
        return { status: 403, body: { error: wandFailureMessage(403) } }
    }
    if (!response.ok) {
        return { status: 502, body: { error: wandFailureMessage(response.status) } }
    }
    let envelope
    try {
        envelope = await response.json()
    } catch (err) {
        return { status: 502, body: { error: wandFailureMessage(502) } }
    }
    const content = envelope && envelope.choices && envelope.choices[0] && envelope.choices[0].message && envelope.choices[0].message.content
    if (typeof content !== 'string') {
        return { status: 502, body: { error: wandFailureMessage(502) } }
    }
    try {
        return { status: 200, body: { arrangement: sanitizeArrangement(JSON.parse(content)), mock: false, model: MODEL } }
    } catch (err) {
        return { status: 502, body: { error: wandFailureMessage(502) } }
    }
}

module.exports = {
    MODEL,
    createRateLimiter,
    createArrangement,
}
