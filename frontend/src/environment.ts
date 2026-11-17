import { Capacitor } from "@capacitor/core"

export const isDev = process.env.NODE_ENV === 'development' || process.env.REACT_APP_OVERRIDE_NODE_ENV === 'development'
export const isLocal = process.env.REACT_APP_IS_LOCAL === 'yes'
export type EnvName = 'local' | 'development' | 'production'
export const envName: EnvName = isLocal ? 'local' : (isDev ? 'development' : 'production')
export const backendUrl = process.env.REACT_APP_BACKEND_URL ?? 'localhost'

/**
 * Card Creator and Open World ask the same host.
 * On the web that is this origin (`/api/...`), which is the Vercel functions
 * in production and the dev proxy locally. A phone build sets
 * REACT_APP_IMAGINE_URL to the machine running imagine-server.js.
 */
export function imagineApiUrl(): string {
    return imagineEndpoint('/api/imagine')
}

export function imagineWorldApiUrl(): string {
    return imagineEndpoint('/api/imagine-world')
}

function imagineEndpoint(path: string): string {
    const configured = process.env.REACT_APP_IMAGINE_URL
    if (configured != null && configured.trim() !== '') {
        return configured.trim().replace(/\/$/, '') + path
    }
    return path
}
export const platform = Capacitor.getPlatform() as 'web' | 'ios' | 'android'
console.log({ isDev, isLocal, backendUrl })
