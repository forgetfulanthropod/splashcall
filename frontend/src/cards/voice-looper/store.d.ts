import { Library } from './song'

export const LIBRARY_KEY: string
export function rememberAudio(samples: Float32Array, rate: number): Promise<string>
export function recallAudio(id: string): Promise<{ samples: Float32Array, rate: number } | null>
export function releaseAudio(id: string): Promise<void>
export function readLibrary(): Library | null
export function writeLibrary(library: Library): string
export function retainAudio(previous: Library, next: Library): Promise<void>
export function keepAwake(): Promise<void>
