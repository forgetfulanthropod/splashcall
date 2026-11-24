import { Song } from './song'

export type MixClip = { samples: Float32Array, rate: number }
export type Bounce = { bytes: Uint8Array, mime: string, extension: string, kind: 'aac' | 'wav' }

export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array
export function buildAacMp4(frames: Uint8Array[], sampleRate: number, description: Uint8Array): Uint8Array
export function renderMix(song: Song, clips: Record<string, MixClip>, sampleRate: number, onProgress?: (amount: number) => void): Promise<Float32Array>
export function bounce(song: Song, clips: Record<string, MixClip>, onProgress?: (amount: number) => void, preferWav?: boolean): Promise<Bounce>
export function saveBytes(name: string, bytes: Uint8Array, mime: string): Promise<string>
