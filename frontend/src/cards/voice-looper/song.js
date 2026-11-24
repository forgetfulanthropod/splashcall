/**
 * Song arrangement math. No browser APIs, so the phone and the tests share it.
 * A loop can wait (pre-gap), play, then rest (post-gap) before it repeats.
 * It only does that between its start bar and its end bar.
 */

const { barSeconds, noteName } = require('./theory')

const MAX_SONG_BARS = 400
const MIN_SONG_BARS = 4
const MAX_REVISIONS = 12
const SCHEMA = 1

const PITCH = {
    C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
    'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
}

/** Roman numerals in C. Lowercase is minor. */
const ROMAN = {
    I: { root: 0, quality: 'maj' },
    ii: { root: 2, quality: 'min' },
    iii: { root: 4, quality: 'min' },
    IV: { root: 5, quality: 'maj' },
    V: { root: 7, quality: 'maj' },
    vi: { root: 9, quality: 'min' },
    vii: { root: 11, quality: 'min' },
}

const PRESETS = [
    { id: 'pop', name: 'I–V–vi–IV', text: 'I V vi IV' },
    { id: 'fifties', name: 'I–vi–IV–V', text: 'I vi IV V' },
    { id: 'jazz', name: 'ii–V–I', text: 'ii V I' },
    { id: 'blues', name: 'I–IV–V', text: 'I IV V' },
    { id: 'axis', name: 'vi–IV–I–V', text: 'vi IV I V' },
]

function clamp(value, lo, hi) {
    const n = Number(value)
    if (!Number.isFinite(n)) return lo
    return Math.max(lo, Math.min(hi, n))
}

function gapSeconds(beats, ms, bpm) {
    const beat = 60 / (bpm > 0 ? bpm : 90)
    return Math.max(0, (Number(beats) || 0) * beat + (Number(ms) || 0) / 1000)
}

function cycleOf(bpm, loopLength, gaps) {
    const pre = gapSeconds(gaps && gaps.preGapBeats, gaps && gaps.preGapMs, bpm)
    const post = gapSeconds(gaps && gaps.postGapBeats, gaps && gaps.postGapMs, bpm)
    const loop = loopLength > 0 ? loopLength : 0
    return { pre, loop, post, cycle: pre + loop + post }
}

function windowOf(bpm, startBar, endBar) {
    const bar = barSeconds(bpm)
    const start = Math.max(0, startBar) * bar
    const end = Math.max(start + bar, endBar) * bar
    return { start, end, bar }
}

/**
 * Where a track is at `elapsed` seconds into the song.
 * `sounding` is false in a gap and outside the start/end bars.
 * `offset` is seconds into the recorded loop. `through` is 0..1 across that loop.
 */
function placement(elapsed, bpm, loopLength, gaps, startBar, endBar) {
    const win = windowOf(bpm, startBar, endBar)
    const cyc = cycleOf(bpm, loopLength, gaps)
    if (!(elapsed >= win.start) || !(elapsed < win.end) || !(cyc.cycle > 0) || !(cyc.loop > 0)) {
        return { sounding: false, offset: 0, through: 0, bar: 0 }
    }
    const local = elapsed - win.start
    const pos = ((local % cyc.cycle) + cyc.cycle) % cyc.cycle
    const bar = Math.floor(elapsed / win.bar)
    if (pos < cyc.pre || pos >= cyc.pre + cyc.loop) {
        return { sounding: false, offset: 0, through: 0, bar }
    }
    const offset = pos - cyc.pre
    return { sounding: true, offset, through: offset / cyc.loop, bar }
}

/** Upcoming moments the loop should start, in song-seconds, within [from, to). */
function schedulePoints(from, to, bpm, loopLength, gaps, startBar, endBar) {
    const win = windowOf(bpm, startBar, endBar)
    const cyc = cycleOf(bpm, loopLength, gaps)
    const points = []
    if (!(cyc.cycle > 0) || !(cyc.loop > 0) || !(to > from)) return points
    const first = win.start + Math.floor(Math.max(0, from - win.start) / cyc.cycle) * cyc.cycle
    for (let cycleStart = first; cycleStart < win.end && cycleStart < to + cyc.cycle; cycleStart += cyc.cycle) {
        const soundStart = cycleStart + cyc.pre
        const soundEnd = Math.min(soundStart + cyc.loop, win.end)
        if (soundEnd <= from || soundStart >= to) continue
        const begin = Math.max(soundStart, from)
        // songTime is when this slice should be heard. cycle is the stable
        // downbeat, so a late take can start mid-loop without being stacked.
        points.push({
            songTime: begin,
            offset: begin - soundStart,
            duration: soundEnd - begin,
            cycle: soundStart,
        })
    }
    return points
}

function driveAt(through, points) {
    const list = Array.isArray(points) ? points.slice().sort((a, b) => a.x - b.x) : []
    if (list.length === 0) return 0
    const x = clamp(through, 0, 1)
    if (x <= list[0].x) return clamp(list[0].y, 0, 1)
    const last = list[list.length - 1]
    if (x >= last.x) return clamp(last.y, 0, 1)
    for (let i = 1; i < list.length; i++) {
        if (x <= list[i].x) {
            const span = list[i].x - list[i - 1].x
            const mix = span > 0 ? (x - list[i - 1].x) / span : 0
            return clamp(list[i - 1].y + (list[i].y - list[i - 1].y) * mix, 0, 1)
        }
    }
    return clamp(last.y, 0, 1)
}

function shaperSamples(drive) {
    const n = 128
    const curve = new Array(n)
    const amount = clamp(drive, 0, 1)
    const k = 1 + amount * 40
    const norm = Math.tanh(k)
    for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1
        curve[i] = Math.tanh(k * x) / (norm || 1)
    }
    return curve
}

function sectionDrive(bar, sections, fallback) {
    if (!Array.isArray(sections)) return fallback
    for (let i = 0; i < sections.length; i++) {
        if (sections[i] && sections[i].bar === bar && Number.isFinite(sections[i].drive)) {
            return clamp(sections[i].drive, 0, 1)
        }
    }
    return fallback
}

function qualityScale(quality) {
    if (quality === 'min') return 'Minor'
    if (quality === 'dom') return 'Mixolydian'
    return 'Major'
}

function parseChordToken(token) {
    const text = String(token || '').trim()
    if (!text) return null
    if (ROMAN[text]) {
        return { root: ROMAN[text].root, quality: ROMAN[text].quality, label: text }
    }
    const match = text.match(/^([A-G](?:#|b)?)(.*)$/)
    if (!match || PITCH[match[1]] == null) return null
    const rest = match[2].toLowerCase()
    let quality = 'maj'
    if (rest.indexOf('m') === 0 && rest.indexOf('maj') !== 0) quality = 'min'
    else if (rest.indexOf('7') >= 0 && rest.indexOf('maj') !== 0) quality = 'dom'
    return { root: PITCH[match[1]], quality, label: match[1] + (quality === 'min' ? 'm' : '') }
}

function parseProgression(text) {
    const chords = []
    String(text || '').split(/[\s,–—-]+/).forEach((token) => {
        const chord = parseChordToken(token)
        if (chord) chords.push(chord)
    })
    return chords
}

function chordAt(elapsed, bpm, chords, barsEach) {
    if (!Array.isArray(chords) || chords.length === 0) return null
    const each = barsEach > 0 ? barsEach : 1
    const bar = Math.floor((elapsed > 0 ? elapsed : 0) / barSeconds(bpm))
    const index = Math.floor(bar / each) % chords.length
    const chord = chords[(index + chords.length) % chords.length]
    return {
        root: chord.root,
        quality: chord.quality,
        label: chord.label,
        scale: qualityScale(chord.quality),
        bar,
    }
}

function songSeconds(bpm, bars) {
    return barSeconds(bpm) * clamp(bars, MIN_SONG_BARS, MAX_SONG_BARS)
}

function barsForMinutes(bpm, minutes) {
    const seconds = clamp(minutes, 0.25, 12) * 60
    return clamp(Math.ceil(seconds / barSeconds(bpm)), MIN_SONG_BARS, MAX_SONG_BARS)
}

function formatClock(seconds) {
    const safe = seconds > 0 ? seconds : 0
    const mins = Math.floor(safe / 60)
    const secs = Math.floor(safe % 60)
    return mins + ':' + (secs < 10 ? '0' : '') + secs
}

function defaultDistort() {
    return { mix: 0, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }], sections: [] }
}

function defaultTrack(partial) {
    const seed = partial || {}
    return {
        id: seed.id || 'track',
        name: seed.name || 'Track',
        root: clamp(seed.root, 0, 11),
        scale: seed.scale || 'Major',
        strength: clamp(seed.strength == null ? 70 : seed.strength, 0, 100),
        bypass: Boolean(seed.bypass),
        volume: clamp(seed.volume == null ? 80 : seed.volume, 0, 100),
        muted: Boolean(seed.muted),
        bars: seed.bars === 'free' || seed.bars === 1 || seed.bars === 2 || seed.bars === 4 || seed.bars === 8 ? seed.bars : 4,
        audioId: typeof seed.audioId === 'string' ? seed.audioId : '',
        wand: Boolean(seed.wand),
        preGapBeats: clamp(seed.preGapBeats, 0, 16),
        postGapBeats: clamp(seed.postGapBeats, 0, 16),
        preGapMs: clamp(seed.preGapMs, 0, 2000),
        postGapMs: clamp(seed.postGapMs, 0, 2000),
        startBar: clamp(seed.startBar, 0, MAX_SONG_BARS - 1),
        endBar: clamp(seed.endBar == null ? 32 : seed.endBar, 1, MAX_SONG_BARS),
        distort: {
            mix: clamp(seed.distort && seed.distort.mix, 0, 1),
            points: Array.isArray(seed.distort && seed.distort.points) && seed.distort.points.length
                ? seed.distort.points.map((point) => ({ x: clamp(point.x, 0, 1), y: clamp(point.y, 0, 1) }))
                : [{ x: 0, y: 0 }, { x: 1, y: 0 }],
            sections: Array.isArray(seed.distort && seed.distort.sections)
                ? seed.distort.sections.map((section) => ({ bar: clamp(section.bar, 0, MAX_SONG_BARS), drive: clamp(section.drive, 0, 1) }))
                : [],
        },
    }
}

function defaultSong(partial) {
    const seed = partial || {}
        const tracks = Array.isArray(seed.tracks) && seed.tracks.length
        ? seed.tracks.map(defaultTrack)
        : [
            defaultTrack({ id: 'track-1', name: 'Track 1', strength: 0, bars: 'free', endBar: 16 }),
        ]
    return {
        id: seed.id || 'song',
        name: typeof seed.name === 'string' && seed.name.trim() ? seed.name.slice(0, 40) : 'Untitled song',
        updated: Number.isFinite(seed.updated) ? seed.updated : 0,
        bpm: clamp(seed.bpm == null ? 90 : seed.bpm, 40, 200),
        songBars: clamp(seed.songBars == null ? 32 : seed.songBars, MIN_SONG_BARS, MAX_SONG_BARS),
        countIn: seed.countIn === true,
        metronome: Boolean(seed.metronome),
        metronomeVolume: clamp(seed.metronomeVolume == null ? 70 : seed.metronomeVolume, 0, 100),
        inputTrim: clamp(seed.inputTrim == null ? 100 : seed.inputTrim, 0, 200),
        followChords: Boolean(seed.followChords),
        barsEach: seed.barsEach === 2 || seed.barsEach === 4 ? seed.barsEach : 1,
        chords: Array.isArray(seed.chords) ? seed.chords.map((chord) => ({
            root: clamp(chord.root, 0, 11),
            quality: chord.quality === 'min' || chord.quality === 'dom' ? chord.quality : 'maj',
            label: typeof chord.label === 'string' ? chord.label.slice(0, 8) : noteName(chord.root || 0),
        })) : parseProgression('I V vi IV'),
        tracks,
        revisions: [],
    }
}

function freshLibrary() {
    const song = defaultSong({ id: 'song-1', name: 'Song 1', updated: 0 })
    return { version: SCHEMA, activeId: song.id, songs: [song] }
}

/** The first looper builds autosaved these empty starter tracks. */
const DEMO_IDS = { vocals: true, harmony: true, beatbox: true, bass: true }
const DEMO_SEED = ['harmony', 'beatbox', 'bass']

function emptyShell(song) {
    return defaultSong({
        id: song.id,
        name: song.name,
        bpm: song.bpm,
        songBars: song.songBars,
        updated: song.updated,
    })
}

/**
 * Drop the autosaved starter rows. A phone that already recorded keeps that
 * one take on a single track. Empty extra rows (Track 5 and the rest) go away
 * with the seed, because they were never audio.
 */
function dropEmptyDemo(song) {
    const seeded = DEMO_SEED.every((id) => song.tracks.some((track) => track.id === id))
    if (seeded) {
        const voiced = song.tracks.find((track) => track.audioId)
        const base = emptyShell(song)
        if (voiced != null && voiced.audioId) {
            base.tracks = [defaultTrack({
                id: 'track-1',
                name: 'Track 1',
                bars: voiced.bars === 'free' || voiced.bars === 1 || voiced.bars === 2 || voiced.bars === 4 || voiced.bars === 8 ? voiced.bars : 'free',
                strength: 0,
                bypass: voiced.bypass,
                audioId: voiced.audioId,
                volume: voiced.volume,
                endBar: 16,
            })]
        }
        return base
    }
    const kept = song.tracks.filter((track) => !(DEMO_IDS[track.id] && !track.audioId))
    if (kept.length === song.tracks.length) return song
    if (!kept.some((track) => track.audioId)) return emptyShell(song)
    return Object.assign({}, song, { tracks: kept })
}

function finishLoadedSong(song) {
    const stripped = dropEmptyDemo(song)
    const revisions = Array.isArray(song.revisions) ? song.revisions : []
    stripped.revisions = revisions.map((revision) => {
        const inner = dropEmptyDemo(revision.song)
        inner.revisions = []
        return {
            id: revision.id,
            at: revision.at,
            label: revision.label,
            song: inner,
        }
    })
    return stripped
}

function migrate(raw) {
    if (raw == null || typeof raw !== 'object') return freshLibrary()
    const songs = Array.isArray(raw.songs) ? raw.songs.map((song) => {
        const next = defaultSong(song)
        next.revisions = Array.isArray(song.revisions) ? song.revisions.slice(-MAX_REVISIONS).map(cleanRevision) : []
        return finishLoadedSong(next)
    }) : []
    if (songs.length === 0) return freshLibrary()
    const activeId = songs.some((song) => song.id === raw.activeId) ? raw.activeId : songs[0].id
    return { version: SCHEMA, activeId, songs }
}

function cleanRevision(revision) {
    return {
        id: typeof revision.id === 'string' ? revision.id : 'rev',
        at: Number.isFinite(revision.at) ? revision.at : 0,
        label: typeof revision.label === 'string' ? revision.label.slice(0, 48) : 'Saved version',
        song: defaultSong(revision.song || {}),
    }
}

function cloneSong(song) {
    return defaultSong(JSON.parse(JSON.stringify(song)))
}

/** Remember the current song, then make the chosen revision current. */
function restoreRevision(song, revision, now) {
    const current = cloneSong(song)
    current.revisions = []
    const kept = (song.revisions || []).slice(-(MAX_REVISIONS - 1))
    kept.push({
        id: 'rev-' + now,
        at: now,
        label: 'Before restore',
        song: current,
    })
    const restored = defaultSong(revision.song)
    restored.id = song.id
    restored.name = song.name
    restored.revisions = kept
    restored.updated = now
    return restored
}

function pushRevision(song, label, now) {
    const snap = cloneSong(song)
    snap.revisions = []
    const revisions = (song.revisions || []).slice(-(MAX_REVISIONS - 1))
    revisions.push({ id: 'rev-' + now, at: now, label: label.slice(0, 48), song: snap })
    return revisions
}

function hashSamples(samples) {
    let hash = 2166136261
    const stride = Math.max(1, Math.floor(samples.length / 4096))
    for (let i = 0; i < samples.length; i += stride) {
        const bits = Math.round((samples[i] || 0) * 10000)
        hash ^= bits
        hash = Math.imul(hash, 16777619)
    }
    hash = (hash ^ samples.length) >>> 0
    return 'a' + hash.toString(16) + 'x' + samples.length
}

function createMemoryLibrary() {
    const blobs = new Map()
    const refs = new Map()
    return {
        put(samples, rate) {
            const id = hashSamples(samples) + 'r' + rate
            if (!blobs.has(id)) blobs.set(id, { samples: Float32Array.from(samples), rate })
            refs.set(id, (refs.get(id) || 0) + 1)
            return id
        },
        get(id) {
            return blobs.get(id) || null
        },
        release(id) {
            const next = (refs.get(id) || 0) - 1
            if (next <= 0) {
                refs.delete(id)
                blobs.delete(id)
            } else refs.set(id, next)
        },
        refcount(id) {
            return refs.get(id) || 0
        },
    }
}

/** Collect audio ids a song still needs, including revisions. */
function audioIdsOf(song) {
    const ids = []
    song.tracks.forEach((track) => { if (track.audioId) ids.push(track.audioId) })
    ;(song.revisions || []).forEach((revision) => {
        ;(revision.song.tracks || []).forEach((track) => { if (track.audioId) ids.push(track.audioId) })
    })
    return ids
}

module.exports = {
    MAX_SONG_BARS,
    MIN_SONG_BARS,
    MAX_REVISIONS,
    SCHEMA,
    PRESETS,
    gapSeconds,
    cycleOf,
    placement,
    schedulePoints,
    driveAt,
    shaperSamples,
    sectionDrive,
    parseProgression,
    chordAt,
    songSeconds,
    barsForMinutes,
    formatClock,
    defaultDistort,
    defaultTrack,
    defaultSong,
    freshLibrary,
    migrate,
    restoreRevision,
    pushRevision,
    hashSamples,
    createMemoryLibrary,
    audioIdsOf,
    qualityScale,
}
