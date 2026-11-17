/**
 * Turn model HTML into a page that can run inside a sandboxed iframe.
 * The matching server copy is backend/imagine.js. This copy runs on the
 * phone, so a game from the server or from the other caller is checked here.
 *
 * The iframe must use sandbox="allow-scripts" and must not add
 * allow-same-origin. That gives the game an opaque origin: it cannot read
 * the app, storage, or the call. The CSP blocks network access.
 */

import { Creation, IdleName, ObjectPart, ShapeName } from './types'

const MAX_GAME_HTML = 40 * 1024
const MAX_PARTS = 16

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

/** The only sandbox token the game iframe is allowed to set. */
export const GAME_IFRAME_SANDBOX = 'allow-scripts'

const NAMED_COLORS: Record<string, string> = {
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

const SHAPES: ShapeName[] = ['circle', 'rect', 'ellipse', 'triangle', 'roundRect']
const IDLES: IdleName[] = ['bob', 'sway', 'breathe', 'blink']

function clamp(value: unknown, min: number, max: number, fallback: number): number {
    const number = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(number)) return fallback
    return Math.min(max, Math.max(min, number))
}

function cleanTitle(value: unknown): string {
    const raw = typeof value === 'string' ? value : ''
    const text = raw.replace(/<[^>]*>/g, '').replace(/[<>&]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40)
    return text.length > 0 ? text : 'Something new'
}

export function cssColor(value: unknown, fallback: string): string {
    if (typeof value !== 'string') return fallback
    const text = value.trim().toLowerCase()
    if (/^#[0-9a-f]{3}$/.test(text)) {
        return '#' + text.charAt(1) + text.charAt(1) + text.charAt(2) + text.charAt(2) + text.charAt(3) + text.charAt(3)
    }
    if (/^#[0-9a-f]{6}$/.test(text) || /^#[0-9a-f]{8}$/.test(text)) return text
    if (Object.prototype.hasOwnProperty.call(NAMED_COLORS, text) === true) return NAMED_COLORS[text]
    return fallback
}

function stripDangerous(html: string): string {
    return html
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

/** Returns a full document, or null when the game is empty or too big. */
export function prepareGameHtml(raw: string): string | null {
    if (typeof raw !== 'string') return null
    if (raw.length > MAX_GAME_HTML) return null
    let html = stripDangerous(raw).trim()
    if (html.length === 0) return null
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
    if (html.length > MAX_GAME_HTML + 1200) return null
    return html
}

function acceptParts(value: unknown): ObjectPart[] | null {
    if (!Array.isArray(value)) return null
    const parts: ObjectPart[] = []
    const limit = Math.min(value.length, MAX_PARTS)
    for (let i = 0; i < limit; i++) {
        const item = value[i] as Partial<ObjectPart> | null
        if (item == null || typeof item !== 'object') continue
        const shape = SHAPES.indexOf(item.shape as ShapeName) >= 0 ? item.shape as ShapeName : 'ellipse'
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

export function acceptCreation(input: unknown): Creation | null {
    if (input == null || typeof input !== 'object') return null
    const raw = input as Record<string, unknown>
    const kind = raw.kind === 'game' ? 'game' : raw.kind === 'object' ? 'object' : null
    if (kind == null) return null
    const title = cleanTitle(raw.title)
    const idle = IDLES.indexOf(raw.idle as IdleName) >= 0 ? raw.idle as IdleName : 'bob'
    const background = cssColor(raw.background, kind === 'game' ? '#101820' : '#d7e6f2')
    if (kind === 'game') {
        if (typeof raw.gameHtml !== 'string') return null
        const gameHtml = prepareGameHtml(raw.gameHtml)
        if (gameHtml == null) return null
        return { kind, title, idle, background, parts: [], gameHtml }
    }
    const parts = acceptParts(raw.parts)
    if (parts == null || parts.length === 0) return null
    return { kind, title, idle, background, parts, gameHtml: '' }
}
