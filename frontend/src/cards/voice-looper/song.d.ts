export const MAX_SONG_BARS: number
export const MIN_SONG_BARS: number
export const MAX_REVISIONS: number
export const SCHEMA: number
export const PRESETS: { id: string, name: string, text: string }[]

export type ChordQuality = 'maj' | 'min' | 'dom'
export type SongChord = { root: number, quality: ChordQuality, label: string }
export type DistortPoint = { x: number, y: number }
export type SectionDrive = { bar: number, drive: number }
export type Distort = { mix: number, points: DistortPoint[], sections: SectionDrive[] }
export type LoopLength = 1 | 2 | 4 | 8 | 'free'

export type SongTrack = {
    id: string
    name: string
    root: number
    scale: string
    strength: number
    bypass: boolean
    volume: number
    muted: boolean
    bars: LoopLength
    audioId: string
    wand?: boolean
    preGapBeats: number
    postGapBeats: number
    preGapMs: number
    postGapMs: number
    startBar: number
    endBar: number
    distort: Distort
}

export type SongRevision = { id: string, at: number, label: string, song: Song }
export type Song = {
    id: string
    name: string
    updated: number
    bpm: number
    songBars: number
    countIn: boolean
    metronome: boolean
    metronomeVolume: number
    inputTrim: number
    followChords: boolean
    barsEach: number
    chords: SongChord[]
    tracks: SongTrack[]
    revisions: SongRevision[]
}
export type Library = { version: number, activeId: string, songs: Song[] }
export type Placement = { sounding: boolean, offset: number, through: number, bar: number }
export type SchedulePoint = { songTime: number, offset: number, duration: number }

export function gapSeconds(beats: number, ms: number, bpm: number): number
export function cycleOf(bpm: number, loopLength: number, gaps: { preGapBeats?: number, preGapMs?: number, postGapBeats?: number, postGapMs?: number }): { pre: number, loop: number, post: number, cycle: number }
export function placement(elapsed: number, bpm: number, loopLength: number, gaps: { preGapBeats?: number, preGapMs?: number, postGapBeats?: number, postGapMs?: number }, startBar: number, endBar: number): Placement
export function schedulePoints(from: number, to: number, bpm: number, loopLength: number, gaps: { preGapBeats?: number, preGapMs?: number, postGapBeats?: number, postGapMs?: number }, startBar: number, endBar: number): SchedulePoint[]
export function driveAt(through: number, points: DistortPoint[]): number
export function shaperSamples(drive: number): number[]
export function sectionDrive(bar: number, sections: SectionDrive[], fallback: number): number
export function parseProgression(text: string): SongChord[]
export function chordAt(elapsed: number, bpm: number, chords: SongChord[], barsEach: number): { root: number, quality: ChordQuality, label: string, scale: string, bar: number } | null
export function songSeconds(bpm: number, bars: number): number
export function barsForMinutes(bpm: number, minutes: number): number
export function formatClock(seconds: number): string
export function defaultTrack(partial?: Partial<SongTrack>): SongTrack
export function defaultSong(partial?: Partial<Song>): Song
export function freshLibrary(): Library
export function migrate(raw: unknown): Library
export function restoreRevision(song: Song, revision: SongRevision, now: number): Song
export function pushRevision(song: Song, label: string, now: number): SongRevision[]
export function hashSamples(samples: Float32Array | number[]): string
export function audioIdsOf(song: Song): string[]
export function qualityScale(quality: string): string
export function createMemoryLibrary(): {
    put(samples: Float32Array | number[], rate: number): string
    get(id: string): { samples: Float32Array, rate: number } | null
    release(id: string): void
    refcount(id: string): number
}
