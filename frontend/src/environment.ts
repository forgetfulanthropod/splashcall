import { Capacitor } from "@capacitor/core"

export const isDev = process.env.NODE_ENV === 'development' || process.env.REACT_APP_OVERRIDE_NODE_ENV === 'development'
export const isLocal = process.env.REACT_APP_IS_LOCAL === 'yes'
export type EnvName = 'local' | 'development' | 'production'
export const envName: EnvName = isLocal ? 'local' : (isDev ? 'development' : 'production')
export const backendUrl = process.env.REACT_APP_BACKEND_URL ?? 'localhost'
export const platform = Capacitor.getPlatform() as 'web' | 'ios' | 'android'
console.log({ isDev, isLocal, backendUrl })
