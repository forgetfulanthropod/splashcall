import { SongTrack } from './song'

export type TakeFeatures = {
    bpm: number
    key: number
    keyName: string
    scale: string
    loopSeconds: number
    rms: number
    peak: number
    bars: number
}
export type WandPart = {
    name: string
    kind: 'bass' | 'drums' | 'pad'
    notes: string[]
    pattern: string[]
    startBar: number
    endBar: number
}
export type WandArrangement = { chords: string[], barsEach: number, parts: WandPart[] }

export function wandFailureMessage(status: number): string
export function analyzeTake(samples: Float32Array | number[], sampleRate: number, bpmHint: number): TakeFeatures
export function sanitizeArrangement(raw: unknown): WandArrangement
export function practiceArrangement(features: TakeFeatures | null): WandArrangement
export function arrangementToTracks(arrangement: unknown, userTracks: SongTrack[], now: number): { tracks: SongTrack[], arrangement: WandArrangement }
export function renderPart(part: WandPart, bpm: number, sampleRate: number): Float32Array
export function buildWandRequest(features: TakeFeatures): Record<string, unknown>
