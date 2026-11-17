/**
 * Ask xAI for an Open World spec, or hand back a built-in practice world.
 * The key is passed in. This file never reads it from disk.
 */

const { MAX_IDEA_CHARS, completeStructured, createRateLimiter } = require('./imagine')
const {
    buildWorldChatRequest,
    practiceWorldFor,
    sanitizeWorld,
} = require('../src/cards/open-world/spec')

const MODEL = 'grok-4.7'

function scrub(message, apiKey) {
    const text = String(message || '')
    if (!apiKey) return text
    return text.split(apiKey).join('[redacted]')
}

async function createWorldFromIdea(idea, options) {
    const settings = options || {}
    const apiKey = typeof settings.apiKey === 'string' ? settings.apiKey.trim() : ''
    const limiter = settings.limiter
    const ip = settings.ip || 'unknown'
    if (limiter && !limiter.allow(ip)) {
        return { status: 429, body: { error: 'The creator is busy. Wait a moment and try again.' } }
    }
    if (typeof idea !== 'string') {
        return { status: 400, body: { error: 'Tell me what you imagine, in words.' } }
    }
    const trimmed = idea.trim()
    if (trimmed.length === 0) {
        return { status: 400, body: { error: 'Type an idea first.' } }
    }
    if (trimmed.length > MAX_IDEA_CHARS) {
        return { status: 400, body: { error: 'That idea is too long. Keep it to a sentence or two.' } }
    }
    try {
        const raw = apiKey
            ? await completeStructured(buildWorldChatRequest(trimmed), apiKey, settings.fetchImpl)
            : practiceWorldFor(trimmed)
        const world = sanitizeWorld(raw)
        return { status: 200, body: { world, mock: apiKey.length === 0, model: MODEL } }
    } catch (err) {
        const status = err && err.status ? err.status : 502
        const message = err && err.publicMessage
            ? err.publicMessage
            : 'The creator could not finish that. Try again.'
        console.error('imagine-world failed', scrub(err && err.message, apiKey))
        return { status, body: { error: message } }
    }
}

module.exports = {
    MODEL,
    createRateLimiter,
    createWorldFromIdea,
}
