import { imagineApiUrl } from '../../environment'
import { acceptCreation } from './sandbox'
import { Creation } from './types'

function messageFrom(status: number, data: unknown): string {
    const fallback = status === 429
        ? 'The creator is busy. Wait a moment and try again.'
        : status === 413
            ? 'That came back too big to keep. Try a simpler idea.'
            : 'The creator could not finish that. Try again.'
    if (data != null && typeof data === 'object' && 'error' in data) {
        const error = (data as { error: unknown }).error
        if (typeof error === 'string' && error.length > 0 && error.length < 180 && !/api[_-]?key/i.test(error)) {
            return error
        }
    }
    return fallback
}

export async function imagine(idea: string): Promise<Creation> {
    let response: Response
    try {
        response = await fetch(imagineApiUrl(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idea }),
            cache: 'no-store',
        })
    } catch (err) {
        throw new Error('The card creator server is not running. In the backend folder, run: node imagine-server.js')
    }
    let data: unknown = null
    try {
        data = await response.json()
    } catch (err) {
        data = null
    }
    if (!response.ok) throw new Error(messageFrom(response.status, data))
    const creation = data != null && typeof data === 'object' && 'creation' in data
        ? (data as { creation: unknown }).creation
        : null
    const accepted = acceptCreation(creation)
    if (accepted == null) {
        throw new Error('That idea came back in a shape I could not draw. Try another.')
    }
    return accepted
}
