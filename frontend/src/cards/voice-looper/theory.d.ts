export const NOTES: string[]
export type ScaleName = 'Major' | 'Minor' | 'Dorian' | 'Mixolydian' | 'Pentatonic'
export function noteName(root: number): string
export function scalePitchClasses(root: number, scale: string): number[]
export function targetFrequency(freq: number, mask: number[]): number
export const BEATS_PER_BAR: number
export function barSeconds(bpm: number): number
export function loopSeconds(bpm: number, bars: number): number
export function loopPosition(elapsed: number, seconds: number, bars: number): { bar: number, left: number, progress: number }
export function alignedOffset(elapsed: number, duration: number): number
export function recordDownbeat(now: number, playing: boolean, origin: number, barLength: number, countIn: boolean): number
export function keyLabel(root: number, scale: string): string
