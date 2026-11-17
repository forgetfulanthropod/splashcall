import { imagineWorldApiUrl } from '../../environment'
import { practiceWorldFor, sanitizeWorld, WorldSpec } from './spec'

export type ImagineWorldResult = {
    world: WorldSpec
    mock: boolean
    offline: boolean
}

function messageFrom(status: number, data: unknown): string {
    const fallback = status === 429
        ? 'The creator is busy. Wait a moment and try again.'
        : 'The creator could not finish that world. Try again.'
    if (data != null && typeof data === 'object' && 'error' in data) {
        const error = (data as { error: unknown }).error
        if (typeof error === 'string' && error.length > 0 && error.length < 180 && !/api[_-]?key/i.test(error)) {
            return error
        }
    }
    return fallback
}

/** Ask for a world. If the server is missing, use a built-in practice spec. */
export async function imagineWorld(idea: string): Promise<ImagineWorldResult> {
    let response: Response
    try {
        response = await fetch(imagineWorldApiUrl(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idea }),
            cache: 'no-store',
        })
    } catch (err) {
        return { world: practiceWorldFor(idea), mock: true, offline: true }
    }
    if (response.status === 404) {
        return { world: practiceWorldFor(idea), mock: true, offline: true }
    }
    let data: unknown = null
    try {
        data = await response.json()
    } catch (err) {
        data = null
    }
    if (!response.ok) throw new Error(messageFrom(response.status, data))
    const raw = data != null && typeof data === 'object' && 'world' in data
        ? (data as { world: unknown, mock?: unknown }).world
        : null
    if (raw == null) {
        return { world: practiceWorldFor(idea), mock: true, offline: true }
    }
    const mock = data != null && typeof data === 'object' && 'mock' in data
        ? Boolean((data as { mock?: unknown }).mock)
        : false
    return { world: sanitizeWorld(raw), mock, offline: false }
}
