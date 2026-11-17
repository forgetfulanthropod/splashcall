/**
 * Card Creator library: decide object vs game, call xAI, or return a mock.
 * The API key is read by the HTTP server from the XAI_API_KEY environment
 * variable and passed in. This file never reads a key from disk.
 *
 * Game HTML is also checked in frontend/src/cards/card-creator/sandbox.ts.
 * Keep the two copies in step. The phone copy is the one that actually
 * isolates a game, including a game received from the other caller.
 */

const MODEL = 'grok-4.7'
const MAX_IDEA_CHARS = 400
const MAX_OUTPUT_CHARS = 48 * 1024
const MAX_GAME_HTML = 32 * 1024
const MAX_PARTS = 16
const RATE_LIMIT_PER_IP = 8
const RATE_LIMIT_GLOBAL = 60
const RATE_WINDOW_MS = 60 * 1000

const CSP = [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    "img-src data: blob:",
    "font-src data:",
    "media-src data:",
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "worker-src 'none'",
].join('; ')

const CREATION_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['kind', 'title', 'idle', 'background', 'parts', 'gameHtml'],
    properties: {
        kind: {
            type: 'string',
            enum: ['object', 'game'],
            description: 'object = a thing to look at and toss. game = something you play.',
        },
        title: { type: 'string', maxLength: 40 },
        idle: {
            type: 'string',
            enum: ['bob', 'sway', 'breathe', 'blink'],
            description: 'Idle motion for an object. Use bob for a game.',
        },
        background: { type: 'string', maxLength: 16, description: 'Hex color, like #87ceeb.' },
        parts: {
            type: 'array',
            maxItems: MAX_PARTS,
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['shape', 'x', 'y', 'w', 'h', 'color', 'rotation'],
                properties: {
                    shape: { type: 'string', enum: ['circle', 'rect', 'ellipse', 'triangle', 'roundRect'] },
                    x: { type: 'number', minimum: 0, maximum: 100 },
                    y: { type: 'number', minimum: 0, maximum: 100 },
                    w: { type: 'number', minimum: 1, maximum: 100 },
                    h: { type: 'number', minimum: 1, maximum: 100 },
                    color: { type: 'string', maxLength: 16 },
                    rotation: { type: 'number', minimum: -180, maximum: 180 },
                },
            },
        },
        gameHtml: {
            type: 'string',
            maxLength: 24000,
            description: 'Full phone game as HTML, or an empty string for an object. Inline CSS and JS only.',
        },
    },
}

const SYSTEM_PROMPT = [
    'You make one tiny toy for a phone call app called SplashCall.',
    'Decide whether the idea is an object or a game.',
    'An object is a thing to look at and poke: a balloon, a cat, a boat, a sandwich.',
    'A game is something you play, with a goal or a score: catch, jump, puzzle, race.',
    'If it could be either, make an object unless the person asks to play.',
    'Objects are data, never code. Use 4 to 12 parts in a 0-100 box.',
    'x and y are the center of a part. w and h are its size, as a percent of the box.',
    'Colors are hex, like #ff8800. Pick an idle that fits: bob floats, sway rocks, breathe pulses, blink fades.',
    'Games are one HTML page with inline CSS and JavaScript only.',
    'No network, no external files, no libraries, no iframes, no forms that submit.',
    'Fit a phone screen. Use pointer events so a finger works. Show a goal.',
    'Keep the game short. The title is under 28 characters.',
    'For an object, set gameHtml to an empty string and fill parts.',
    'For a game, set parts to an empty array and put the page in gameHtml.',
    'Stay inside the page. Do not ask for secrets, passwords, or anything off the phone.',
].join(' ')

const NAMED_COLORS = {
    red: '#e23d3d',
    blue: '#3a78e0',
    green: '#2faf62',
    yellow: '#f2c14e',
    purple: '#8a4fd4',
    pink: '#f27cbf',
    orange: '#f08a2c',
    black: '#2b2b2b',
    white: '#f7f7f7',
    gold: '#e2b340',
    brown: '#8a5a32',
    teal: '#2aabb8',
}

const SHAPES = ['circle', 'rect', 'ellipse', 'triangle', 'roundRect']
const IDLES = ['bob', 'sway', 'breathe', 'blink']

function publicError(status, message) {
    const error = new Error(message)
    error.status = status
    error.publicMessage = message
    return error
}

function hashString(text) {
    let hash = 2166136261
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i)
        hash = Math.imul(hash, 16777619)
    }
    return hash >>> 0
}

function titleFrom(idea) {
    const clean = String(idea).replace(/\s+/g, ' ').trim().slice(0, 28)
    if (clean.length === 0) return 'Something new'
    return clean.charAt(0).toUpperCase() + clean.slice(1)
}

function colorFromIdea(idea) {
    const lower = idea.toLowerCase()
    const names = Object.keys(NAMED_COLORS)
    for (let i = 0; i < names.length; i++) {
        const name = names[i]
        if (new RegExp('\\b' + name + '\\b', 'i').test(lower)) return NAMED_COLORS[name]
    }
    const hues = ['#e23d3d', '#3a78e0', '#2faf62', '#f2c14e', '#8a4fd4', '#f08a2c', '#2aabb8']
    return hues[hashString(idea) % hues.length]
}

function isGameIdea(idea) {
    return /\b(game|play|player|playing|jump|jumper|maze|puzzle|snake|pong|catch|arcade|score|level|race|racer)\b/i.test(idea)
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

function mockGameHtml(idea) {
    const title = escapeHtml(titleFrom(idea))
    const color = colorFromIdea(idea)
    return [
        '<style>',
        'html,body{margin:0;height:100%;background:#101820;color:#fff;font-family:sans-serif;overflow:hidden;touch-action:none;}',
        '#hud{position:absolute;top:18px;left:16px;right:16px;font-size:22px;font-weight:700;}',
        '#title{font-size:14px;font-weight:500;opacity:.85;margin-top:4px;}',
        '#hint{font-size:13px;font-weight:500;opacity:.7;margin-top:2px;}',
        '#dot{position:absolute;border-radius:50%;background:' + color + ';box-shadow:0 10px 24px rgba(0,0,0,.35);}',
        '</style>',
        '<div id="hud">Score <span id="score">0</span><div id="title">' + title + '</div><div id="hint">Tap the dot</div></div>',
        '<div id="dot"></div>',
        '<script>',
        '(function () {',
        '  var dot = document.getElementById("dot");',
        '  var scoreEl = document.getElementById("score");',
        '  var score = 0, x = 28, y = 46, vx = 0.65, vy = 0.5;',
        '  function size() { return Math.max(54, Math.min(window.innerWidth, window.innerHeight) * 0.24); }',
        '  function frame() {',
        '    var s = size();',
        '    x += vx; y += vy;',
        '    if (x < 4 || x > 96) vx = -vx;',
        '    if (y < 22 || y > 88) vy = -vy;',
        '    dot.style.width = s + "px";',
        '    dot.style.height = s + "px";',
        '    dot.style.left = "calc(" + x + "% - " + (s / 2) + "px)";',
        '    dot.style.top = "calc(" + y + "% - " + (s / 2) + "px)";',
        '    requestAnimationFrame(frame);',
        '  }',
        '  window.addEventListener("pointerdown", function (event) {',
        '    var rect = dot.getBoundingClientRect();',
        '    var cx = rect.left + rect.width / 2;',
        '    var cy = rect.top + rect.height / 2;',
        '    var dx = event.clientX - cx;',
        '    var dy = event.clientY - cy;',
        '    var reach = rect.width * 0.7;',
        '    if (dx * dx + dy * dy <= reach * reach) {',
        '      score += 1;',
        '      scoreEl.textContent = String(score);',
        '      vx = vx > 0 ? vx + 0.12 : vx - 0.12;',
        '      vy = vy > 0 ? vy + 0.08 : vy - 0.08;',
        '    }',
        '  });',
        '  frame();',
        '})();',
        '</script>',
    ].join('\n')
}

function part(shape, x, y, w, h, color, rotation) {
    return { shape, x, y, w, h, color, rotation: rotation || 0 }
}

function mockObject(idea) {
    const lower = idea.toLowerCase()
    const color = colorFromIdea(idea)
    const title = titleFrom(idea)
    if (/\b(balloon|ball|orb|bubble)\b/i.test(lower)) {
        return {
            kind: 'object',
            title,
            idle: 'bob',
            background: '#b9e6fb',
            parts: [
                part('rect', 50, 84, 3, 24, '#6b4a2b', 8),
                part('ellipse', 50, 44, 50, 56, color, 0),
                part('ellipse', 38, 32, 14, 18, '#ffffff', -18),
                part('triangle', 50, 70, 12, 10, '#9a3030', 0),
            ],
            gameHtml: '',
        }
    }
    if (/\b(flower|rose|blossom|tulip)\b/i.test(lower)) {
        return {
            kind: 'object',
            title,
            idle: 'breathe',
            background: '#e7f6d8',
            parts: [
                part('rect', 50, 72, 5, 36, '#2f8a3a', 0),
                part('ellipse', 50, 40, 22, 34, color, 0),
                part('ellipse', 50, 40, 22, 34, color, 60),
                part('ellipse', 50, 40, 22, 34, color, 120),
                part('circle', 50, 40, 16, 16, '#f2c14e', 0),
            ],
            gameHtml: '',
        }
    }
    if (/\b(boat|ship|sail)\b/i.test(lower)) {
        return {
            kind: 'object',
            title,
            idle: 'sway',
            background: '#8fd0ea',
            parts: [
                part('roundRect', 50, 68, 62, 18, '#8a5a32', 0),
                part('rect', 48, 48, 3, 32, '#5c4030', 0),
                part('triangle', 58, 46, 28, 30, '#f7f7f7', 0),
                part('circle', 26, 66, 8, 8, color, 0),
            ],
            gameHtml: '',
        }
    }
    return {
        kind: 'object',
        title,
        idle: 'blink',
        background: '#f6ead2',
        parts: [
            part('ellipse', 50, 58, 62, 48, color, 0),
            part('circle', 50, 34, 46, 46, color, 0),
            part('circle', 40, 32, 12, 12, '#ffffff', 0),
            part('circle', 60, 32, 12, 12, '#ffffff', 0),
            part('circle', 40, 33, 5, 5, '#1d2430', 0),
            part('circle', 60, 33, 5, 5, '#1d2430', 0),
            part('ellipse', 50, 46, 16, 8, '#1d2430', 0),
        ],
        gameHtml: '',
    }
}

function mockCreation(idea) {
    if (isGameIdea(idea)) {
        return {
            kind: 'game',
            title: titleFrom(idea),
            idle: 'bob',
            background: '#101820',
            parts: [],
            gameHtml: mockGameHtml(idea),
        }
    }
    return mockObject(idea)
}

function clamp(value, min, max, fallback) {
    const number = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(number)) return fallback
    return Math.min(max, Math.max(min, number))
}

function cleanTitle(value) {
    const raw = typeof value === 'string' ? value : ''
    const text = raw
        .replace(/<[^>]*>/g, '')
        .replace(/[<>&]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 40)
    return text.length > 0 ? text : 'Something new'
}

function cssColor(value, fallback) {
    if (typeof value !== 'string') return fallback
    const text = value.trim().toLowerCase()
    if (/^#[0-9a-f]{3}$/.test(text)) {
        return '#' + text.charAt(1) + text.charAt(1) + text.charAt(2) + text.charAt(2) + text.charAt(3) + text.charAt(3)
    }
    if (/^#[0-9a-f]{6}$/.test(text) || /^#[0-9a-f]{8}$/.test(text)) return text
    if (Object.prototype.hasOwnProperty.call(NAMED_COLORS, text) === true) return NAMED_COLORS[text]
    return fallback
}

function stripDangerous(html) {
    return String(html)
        .split('\u0000').join('')
        .replace(/<script\b[^>]*\bsrc\s*=[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<script\b[^>]*\bsrc\s*=[^>]*\/?>/gi, '')
        .replace(/<link\b[^>]*>/gi, '')
        .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
        .replace(/<iframe\b[^>]*\/?>/gi, '')
        .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '')
        .replace(/<object\b[^>]*\/?>/gi, '')
        .replace(/<embed\b[^>]*>/gi, '')
        .replace(/<base\b[^>]*>/gi, '')
        .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?\s*refresh[^>]*>/gi, '')
        .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?\s*content-security-policy[^>]*>/gi, '')
        .replace(/javascript\s*:/gi, '')
}

function prepareGameHtml(raw) {
    if (typeof raw !== 'string') throw publicError(422, 'That game came back empty.')
    let html = stripDangerous(raw).trim()
    if (html.length === 0) throw publicError(422, 'That game came back empty.')
    if (html.length > MAX_GAME_HTML) throw publicError(413, 'That game is too big to keep. Try a simpler idea.')
    const cspMeta = '<meta http-equiv="Content-Security-Policy" content="' + CSP + '">'
    const viewport = '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">'
    if (/<head[\s>]/i.test(html)) {
        html = html.replace(/<head([^>]*)>/i, '<head$1>' + cspMeta + viewport)
    } else if (/<html[\s>]/i.test(html)) {
        html = html.replace(/<html([^>]*)>/i, '<html$1><head>' + cspMeta + viewport + '</head>')
    } else {
        html = '<!DOCTYPE html><html><head><meta charset="utf-8">' + cspMeta + viewport +
            '<style>html,body{margin:0;height:100%;overflow:hidden;background:#111;color:#fff;font-family:sans-serif;}</style></head><body>' +
            html + '</body></html>'
    }
    if (html.length > MAX_GAME_HTML + 1200) {
        throw publicError(413, 'That game is too big to keep. Try a simpler idea.')
    }
    return html
}

function sanitizeParts(value) {
    if (!Array.isArray(value)) return []
    const parts = []
    const limit = Math.min(value.length, MAX_PARTS)
    for (let i = 0; i < limit; i++) {
        const item = value[i]
        if (item == null || typeof item !== 'object') continue
        const shape = SHAPES.indexOf(item.shape) >= 0 ? item.shape : 'ellipse'
        parts.push({
            shape,
            x: clamp(item.x, 0, 100, 50),
            y: clamp(item.y, 0, 100, 50),
            w: clamp(item.w, 1, 100, 20),
            h: clamp(item.h, 1, 100, 20),
            color: cssColor(item.color, '#888888'),
            rotation: clamp(item.rotation, -180, 180, 0),
        })
    }
    return parts
}

function sanitizeCreation(raw) {
    if (raw == null || typeof raw !== 'object') {
        throw publicError(422, 'That idea came back in a shape I could not draw. Try another.')
    }
    const kind = raw.kind === 'game' ? 'game' : raw.kind === 'object' ? 'object' : null
    if (kind == null) throw publicError(422, 'That idea came back in a shape I could not draw. Try another.')
    const title = cleanTitle(raw.title)
    const idle = IDLES.indexOf(raw.idle) >= 0 ? raw.idle : 'bob'
    const background = cssColor(raw.background, kind === 'game' ? '#101820' : '#d7e6f2')
    if (kind === 'game') {
        return {
            kind,
            title,
            idle,
            background,
            parts: [],
            gameHtml: prepareGameHtml(raw.gameHtml),
        }
    }
    const parts = sanitizeParts(raw.parts)
    if (parts.length === 0) {
        throw publicError(422, 'That object came back with nothing to draw. Try another idea.')
    }
    return { kind, title, idle, background, parts, gameHtml: '' }
}

function buildChatRequest(idea) {
    return {
        model: MODEL,
        reasoning_effort: 'low',
        temperature: 0.7,
        max_tokens: 4096,
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: 'Idea:\n' + idea },
        ],
        response_format: {
            type: 'json_schema',
            json_schema: {
                name: 'splash_creation',
                strict: true,
                schema: CREATION_SCHEMA,
            },
        },
    }
}

function createRateLimiter() {
    const hits = new Map()
    let globalHits = []
    function prune(list, now) {
        const kept = []
        for (let i = 0; i < list.length; i++) {
            if (now - list[i] < RATE_WINDOW_MS) kept.push(list[i])
        }
        return kept
    }
    return {
        allow(ip, now) {
            const stamp = typeof now === 'number' ? now : Date.now()
            const key = ip || 'unknown'
            const ipHits = prune(hits.get(key) || [], stamp)
            const allHits = prune(globalHits, stamp)
            if (ipHits.length >= RATE_LIMIT_PER_IP || allHits.length >= RATE_LIMIT_GLOBAL) {
                hits.set(key, ipHits)
                globalHits = allHits
                return false
            }
            ipHits.push(stamp)
            allHits.push(stamp)
            hits.set(key, ipHits)
            globalHits = allHits
            return true
        },
    }
}

async function readLimitedText(response) {
    if (response.body == null || typeof response.body.getReader !== 'function') {
        const text = await response.text()
        if (text.length > MAX_OUTPUT_CHARS) {
            throw publicError(413, 'That came back too big to keep. Try a simpler idea.')
        }
        return text
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let total = 0
    let out = ''
    while (true) {
        const step = await reader.read()
        if (step.done) break
        total += step.value.byteLength
        if (total > MAX_OUTPUT_CHARS) {
            try { await reader.cancel() } catch (err) { /* already over the cap */ }
            throw publicError(413, 'That came back too big to keep. Try a simpler idea.')
        }
        out += decoder.decode(step.value, { stream: true })
    }
    out += decoder.decode()
    return out
}

async function callModel(idea, apiKey, fetchImpl) {
    const fetchFn = fetchImpl || globalThis.fetch
    const controller = typeof AbortController === 'function' ? new AbortController() : null
    const timer = setTimeout(function () {
        if (controller) controller.abort()
    }, 45000)
    let response
    try {
        response = await fetchFn('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + apiKey,
            },
            body: JSON.stringify(buildChatRequest(idea)),
            signal: controller ? controller.signal : undefined,
        })
    } catch (err) {
        throw publicError(502, 'The creator could not reach xAI. Try again in a moment.')
    } finally {
        clearTimeout(timer)
    }
    const text = await readLimitedText(response)
    if (!response.ok) {
        throw publicError(502, 'The creator could not finish that. Try again.')
    }
    let envelope
    try {
        envelope = JSON.parse(text)
    } catch (err) {
        throw publicError(502, 'The creator sent back something I could not read. Try again.')
    }
    const content = envelope &&
        envelope.choices &&
        envelope.choices[0] &&
        envelope.choices[0].message &&
        envelope.choices[0].message.content
    if (typeof content !== 'string' || content.trim().length === 0) {
        throw publicError(502, 'The creator came back empty. Try another idea.')
    }
    if (content.length > MAX_OUTPUT_CHARS) {
        throw publicError(413, 'That came back too big to keep. Try a simpler idea.')
    }
    try {
        return JSON.parse(content)
    } catch (err) {
        throw publicError(502, 'The creator sent back something I could not read. Try again.')
    }
}

function scrub(message, apiKey) {
    const text = String(message || '')
    if (!apiKey) return text
    return text.split(apiKey).join('[redacted]')
}

async function createFromIdea(idea, options) {
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
            ? await callModel(trimmed, apiKey, settings.fetchImpl)
            : mockCreation(trimmed)
        const creation = sanitizeCreation(raw)
        return { status: 200, body: { creation, mock: apiKey.length === 0, model: MODEL } }
    } catch (err) {
        const status = err && err.status ? err.status : 502
        const message = err && err.publicMessage
            ? err.publicMessage
            : 'The creator could not finish that. Try again.'
        console.error('imagine failed', scrub(err && err.message, apiKey))
        return { status, body: { error: message } }
    }
}

module.exports = {
    MODEL,
    MAX_IDEA_CHARS,
    MAX_OUTPUT_CHARS,
    MAX_GAME_HTML,
    CREATION_SCHEMA,
    buildChatRequest,
    createRateLimiter,
    createFromIdea,
    mockCreation,
    prepareGameHtml,
    sanitizeCreation,
}
