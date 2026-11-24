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
    volume?: number
    thin?: boolean
}
export type VocalProfile = {
    bpm: number
    key: number
    keyName: string
    tonic: number
    scale: string
    lowHz: number
    highHz: number
    density: number
    vocalVolume: number
    rms: number
    peak: number
}
export type WandArrangement = { chords: string[], barsEach: number, parts: WandPart[] }

export const LOCAL_NOTE: string
export const WAND_LISTEN_MS: number
export function wandFailureMessage(status: number): string
export function listenPlan(hasTake: boolean): { ms: number, source: 'take' | 'mic' }
export function listenToVocal(samples: Float32Array | number[], sampleRate: number, bpmHint: number): VocalProfile
export function buildLocalArrangement(profile: Partial<VocalProfile> | null, seed: number): WandArrangement & { place: string }
export function localWand(profile: Partial<VocalProfile> | null, seed: number, userTracks: SongTrack[], now: number): { tracks: SongTrack[], arrangement: WandArrangement, note: string, local: boolean }
export function estimatePitch(samples: Float32Array | number[], sampleRate: number): number
export function centsBetween(hz: number, target: number): number
export function noteFreq(text: string): number
export function resolveWand(api: { arrangement?: unknown, mock?: boolean } | null, features: TakeFeatures | null, userTracks: SongTrack[], now: number): { tracks: SongTrack[], arrangement: WandArrangement, note: string, local: boolean }
export function analyzeTake(samples: Float32Array | number[], sampleRate: number, bpmHint: number): TakeFeatures
export function sanitizeArrangement(raw: unknown): WandArrangement
export function practiceArrangement(features: TakeFeatures | null): WandArrangement
export function arrangementToTracks(arrangement: unknown, userTracks: SongTrack[], now: number): { tracks: SongTrack[], arrangement: WandArrangement }
export function renderPart(part: WandPart, bpm: number, sampleRate: number): Float32Array
export function buildWandRequest(features: TakeFeatures): Record<string, unknown>
