/**
 * SpaceXSI image generation for SplashCall.
 * Uses the xAI Imagine API (grok-imagine-image-2.0). The key is passed in.
 * This file never reads a key from disk and never puts one in a response.
 */

const MODEL = 'grok-imagine-image-2.0'
const MAX_B64 = 2400000
const cache = new Map()

function cacheGet(key) {
    return cache.has(key) ? cache.get(key) : undefined
}

function cacheSet(key, value) {
    if (cache.size > 16) {
        const first = cache.keys().next().value
        cache.delete(first)
    }
    cache.set(key, value)
}

function cleanPrompt(prompt) {
    return String(prompt || '').replace(/\s+/g, ' ').trim().slice(0, 700)
}

/**
 * Returns a data URL, or null when the call fails or the body is not an image.
 * Failures stay quiet so a world or a card can still be returned.
 */
async function generateImage(prompt, apiKey, options) {
    const settings = options || {}
    const text = cleanPrompt(prompt)
    if (!apiKey || text.length === 0) return null
    const fetchFn = settings.fetchImpl || globalThis.fetch
    const controller = typeof AbortController === 'function' ? new AbortController() : null
    const timer = setTimeout(function () {
        if (controller) controller.abort()
    }, 50000)
    let response
    try {
        response = await fetchFn('https://api.x.ai/v1/images/generations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + apiKey,
            },
            body: JSON.stringify({
                model: MODEL,
                prompt: text,
                n: 1,
                aspect_ratio: settings.aspectRatio || '1:1',
                resolution: '1k',
                quality: 'low',
                response_format: 'b64_json',
            }),
            signal: controller ? controller.signal : undefined,
        })
    } catch (err) {
        return null
    } finally {
        clearTimeout(timer)
    }
    let raw = ''
    try {
        raw = typeof response.text === 'function' ? await response.text() : ''
    } catch (err) {
        return null
    }
    if (!response.ok || raw.length === 0 || raw.length > MAX_B64 * 2) return null
    let body
    try {
        body = JSON.parse(raw)
    } catch (err) {
        return null
    }
    const item = body && Array.isArray(body.data) ? body.data[0] : null
    if (item == null || typeof item.b64_json !== 'string') return null
    const b64 = item.b64_json.replace(/\s+/g, '')
    if (b64.length < 80 || b64.length > MAX_B64) return null
    if (!/^[A-Za-z0-9+/=]+$/.test(b64.slice(0, 64))) return null
    const mime = item.mime_type === 'image/png' || item.mime_type === 'image/webp'
        ? item.mime_type
        : 'image/jpeg'
    return 'data:' + mime + ';base64,' + b64
}

async function generateWorldArt(idea, world, apiKey, fetchImpl) {
    const key = 'world:' + cleanPrompt(idea).toLowerCase()
    const hit = cacheGet(key)
    if (hit !== undefined) return hit
    const spec = world || {}
    const biome = spec.biome || 'landscape'
    const enemy = spec.enemies && spec.enemies[0] && spec.enemies[0].name
        ? spec.enemies[0].name
        : 'creature'
    const weapon = spec.weapon && spec.weapon.type ? spec.weapon.type : 'sword'
    const [ground, foe, arm] = await Promise.all([
        generateImage(
            'Seamless tileable top-down video game ground texture. No horizon, no text, no people, no creatures. Repeating natural ' + biome + ' pattern for: ' + idea,
            apiKey,
            { fetchImpl, aspectRatio: '1:1' }
        ),
        generateImage(
            'One video game creature, full body, centered, facing the camera, standing, plain flat background, no text, no scenery. ' + enemy + '. From: ' + idea,
            apiKey,
            { fetchImpl, aspectRatio: '1:1' }
        ),
        generateImage(
            'One video game ' + weapon + ', centered, three-quarter view, plain flat background, no text, no hands, no person. From: ' + idea,
            apiKey,
            { fetchImpl, aspectRatio: '1:1' }
        ),
    ])
    const art = {}
    if (ground) art.ground = ground
    if (foe) art.enemy = foe
    if (arm) art.weapon = arm
    const result = Object.keys(art).length === 0 ? null : art
    cacheSet(key, result)
    return result
}

async function generateCardArt(idea, title, apiKey, fetchImpl) {
    const key = 'card:' + cleanPrompt(idea).toLowerCase()
    const hit = cacheGet(key)
    if (hit !== undefined) return hit
    const subject = title && String(title).trim().length > 0 ? title : idea
    const image = await generateImage(
        'A single charming object or toy, centered, simple soft background, no text, no letters, no watermark. Phone-app illustration of: ' + subject,
        apiKey,
        { fetchImpl, aspectRatio: '1:1' }
    )
    cacheSet(key, image || null)
    return image
}

module.exports = {
    MODEL,
    generateImage,
    generateWorldArt,
    generateCardArt,
}
