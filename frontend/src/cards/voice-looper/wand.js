/**
 * Turn a recording's measured features into extra tracks.
 * The user's own tracks are never removed.
 */

const { defaultTrack } = require('./song')

function wandFailureMessage(status) {
    if (status === 403) return 'Magic wand needs xAI credits'
    return 'Magic wand could not build an arrangement. Your recording is still here.'
}

/** Shown when the live model cannot be called. The local parts still appear. */
const LOCAL_NOTE = 'AI fill needs xAI credits'

function analyzeTake(samples, sampleRate, bpmHint) {
    const rate = sampleRate > 0 ? sampleRate : 44100
    let sum = 0
    let peak = 0
    const step = Math.max(1, Math.floor(samples.length / 8000))
    for (let i = 0; i < samples.length; i += step) {
        const value = samples[i] || 0
        const abs = value < 0 ? -value : value
        if (abs > peak) peak = abs
        sum += value * value
    }
    const count = Math.max(1, Math.ceil(samples.length / step))
    const rms = Math.sqrt(sum / count)
    const pitch = estimatePitch(samples, rate)
    const key = pitch > 0 ? pitchClass(pitch) : 0
    const loopSeconds = samples.length / rate
    return {
        bpm: bpmHint > 0 ? Math.round(bpmHint) : 90,
        key,
        keyName: ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][key],
        scale: 'Major',
        loopSeconds: Math.round(loopSeconds * 100) / 100,
        rms: Math.round(rms * 1000) / 1000,
        peak: Math.round(peak * 1000) / 1000,
        bars: Math.max(1, Math.round(loopSeconds / (4 * (60 / (bpmHint > 0 ? bpmHint : 90))))),
    }
}

function corrAt(samples, lag, size) {
    let corr = 0
    const step = 4
    for (let i = 0; i < size - lag; i += step) corr += (samples[i] || 0) * (samples[i + lag] || 0)
    return corr
}

function estimatePitch(samples, sampleRate) {
    const size = Math.min(samples.length, 4096)
    if (size < 512) return 0
    const minLag = Math.max(2, Math.floor(sampleRate / 900))
    const maxLag = Math.min(Math.floor(sampleRate / 70), Math.floor(size / 2))
    let best = 0
    let bestLag = 0
    for (let lag = minLag; lag <= maxLag; lag++) {
        const corr = corrAt(samples, lag, size)
        if (corr > best) {
            best = corr
            bestLag = lag
        }
    }
    if (!(bestLag > 1) || best <= 0) return 0
    const y0 = corrAt(samples, bestLag - 1, size)
    const y2 = corrAt(samples, bestLag + 1, size)
    const denom = y0 - 2 * best + y2
    const shift = denom === 0 ? 0 : (y0 - y2) / (2 * denom)
    const lag = bestLag + Math.max(-0.5, Math.min(0.5, shift))
    if (!(lag > 1)) return 0
    return sampleRate / lag
}

function centsBetween(hz, target) {
    if (!(hz > 0) || !(target > 0)) return 1000
    return 1200 * Math.log(hz / target) / Math.LN2
}

function pitchClass(freq) {
    const midi = Math.round(69 + 12 * Math.log(freq / 440) / Math.LN2)
    return ((midi % 12) + 12) % 12
}

function sanitizeArrangement(raw) {
    const source = raw && typeof raw === 'object' ? raw : {}
    const chords = Array.isArray(source.chords)
        ? source.chords.map((chord) => String(chord)).filter((chord) => chord.length > 0).slice(0, 8)
        : ['C', 'G', 'Am', 'F']
    const barsEach = source.barsEach === 2 || source.barsEach === 4 ? source.barsEach : 1
    const parts = Array.isArray(source.parts) ? source.parts.slice(0, 6).map(sanitizePart) : []
    return { chords, barsEach, parts }
}

function sanitizePart(part) {
    const kind = part && (part.kind === 'drums' || part.kind === 'bass' || part.kind === 'pad') ? part.kind : 'pad'
    const notes = Array.isArray(part && part.notes) ? part.notes.map((note) => String(note)).slice(0, 16) : []
    const pattern = Array.isArray(part && part.pattern) ? part.pattern.map((hit) => String(hit)).slice(0, 16) : []
    return {
        name: part && typeof part.name === 'string' && part.name.trim() ? part.name.trim().slice(0, 24) : kind,
        kind,
        notes,
        pattern: pattern.length > 0 ? pattern : ['kick', 'rest', 'hat', 'rest'],
        startBar: Math.max(0, Math.round(Number(part && part.startBar) || 0)),
        endBar: Math.max(1, Math.round(Number(part && part.endBar) || 8)),
        volume: Number.isFinite(part && part.volume) ? Math.max(0, Math.min(100, part.volume)) : (kind === 'drums' ? 34 : 48),
        thin: Boolean(part && part.thin),
    }
}

function practiceArrangement(features) {
    const name = features && features.keyName ? features.keyName : 'C'
    return sanitizeArrangement({
        chords: [name, 'G', 'Am', 'F'],
        barsEach: 2,
        parts: [
            { name: 'Wand bass', kind: 'bass', notes: [name + '2', 'G2', 'A2', 'F2'], startBar: 0, endBar: 8 },
            { name: 'Wand drums', kind: 'drums', pattern: ['kick', 'hat', 'snare', 'hat'], startBar: 0, endBar: 8 },
            { name: 'Wand pad', kind: 'pad', notes: [name + '4', 'E4', 'G4'], startBar: 0, endBar: 8 },
        ],
    })
}

/**
 * Use a live arrangement when the API returned one.
 * Any failure, including a credits 403, still builds the local parts
 * around the recording and leaves the user's tracks in place.
 */
function resolveWand(api, features, userTracks, now) {
    const live = api != null && api.arrangement != null
    const arrangement = live ? api.arrangement : practiceArrangement(features)
    const built = arrangementToTracks(arrangement, userTracks, now)
    let note = LOCAL_NOTE
    if (live && api.mock) note = 'Practice arrangement. Your recording is unchanged.'
    else if (live) note = 'Added parts around your recording.'
    return {
        tracks: built.tracks,
        arrangement: built.arrangement,
        note: note,
        local: !live,
    }
}

/** Append wand parts. Every non-wand track is copied through unchanged. */
function arrangementToTracks(arrangement, userTracks, now) {
    const clean = sanitizeArrangement(arrangement)
    const stamp = now > 0 ? now : 1
    const kept = (userTracks || []).filter((track) => !track.wand).map((track) => Object.assign({}, track))
    const added = clean.parts.map((part, index) => defaultTrack({
        id: 'wand-' + stamp + '-' + index,
        name: part.name,
        wand: true,
        bars: 'free',
        strength: 0,
        volume: Number.isFinite(part.volume) ? part.volume : (part.kind === 'drums' ? 34 : 48),
        startBar: part.startBar,
        endBar: part.endBar,
    }))
    return { tracks: kept.concat(added), arrangement: clean }
}

function noteFreq(text) {
    const match = String(text || '').match(/^([A-G](?:#|b)?)(-?\d)?/)
    if (!match) return 110
    const names = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 }
    const pc = names[match[1]]
    const octave = match[2] != null ? Number(match[2]) : 3
    if (pc == null) return 110
    return 440 * Math.pow(2, ((octave + 1) * 12 + pc - 69) / 12)
}

function renderPart(part, bpm, sampleRate) {
    const rate = sampleRate > 0 ? sampleRate : 44100
    const beat = 60 / (bpm > 0 ? bpm : 90)
    const bars = Math.max(1, (part.endBar || 1) - (part.startBar || 0))
    const seconds = bars * 4 * beat
    const length = Math.max(1, Math.floor(seconds * rate))
    const out = new Float32Array(length)
    if (part.kind === 'drums') {
        const pattern = part.pattern && part.pattern.length ? part.pattern : ['kick', 'hat', 'snare', 'hat']
        for (let i = 0; i < length; i++) {
            const beatIndex = Math.floor(i / (beat * rate))
            const hit = pattern[beatIndex % pattern.length]
            const into = (i / rate) % beat
            if (hit !== 'rest' && into < 0.035) {
                const env = 1 - into / 0.035
                const noise = ((i * 17) % 100) / 100 - 0.5
                const amp = hit === 'hat' ? 0.16 : hit === 'snare' ? 0.28 : 0.4
                out[i] = hit === 'hat' ? noise * env * amp : Math.sin(2 * Math.PI * (hit === 'snare' ? 180 : 70) * i / rate) * env * amp
            }
        }
        return out
    }
    const notes = part.notes && part.notes.length ? part.notes : ['C3']
    const noteBeats = part.kind === 'pad' ? 4 : 4
    for (let i = 0; i < length; i++) {
        const which = Math.floor(i / (noteBeats * beat * rate)) % notes.length
        const freq = noteFreq(notes[which])
        const tone = Math.sin(2 * Math.PI * freq * i / rate)
        const amp = part.kind === 'bass' ? 0.4 : part.thin ? 0.07 : 0.16
        out[i] = tone * amp
    }
    return out
}

function buildWandRequest(features) {
    return {
        model: 'grok-4.7',
        temperature: 0.4,
        messages: [
            {
                role: 'system',
                content: 'You arrange music around a recording that already exists. Return only JSON. Do not ask to replace the vocal. Use chord names like C G Am F. Parts are bass, drums, or pad.',
            },
            {
                role: 'user',
                content: JSON.stringify(features),
            },
        ],
        response_format: {
            type: 'json_schema',
            json_schema: {
                name: 'loop_arrangement',
                strict: true,
                schema: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['chords', 'barsEach', 'parts'],
                    properties: {
                        chords: { type: 'array', items: { type: 'string' } },
                        barsEach: { type: 'number' },
                        parts: {
                            type: 'array',
                            items: {
                                type: 'object',
                                additionalProperties: false,
                                required: ['name', 'kind', 'notes', 'pattern', 'startBar', 'endBar'],
                                properties: {
                                    name: { type: 'string' },
                                    kind: { type: 'string' },
                                    notes: { type: 'array', items: { type: 'string' } },
                                    pattern: { type: 'array', items: { type: 'string' } },
                                    startBar: { type: 'number' },
                                    endBar: { type: 'number' },
                                },
                            },
                        },
                    },
                },
            },
        },
    }
}

const WAND_LISTEN_MS = 2000

const PROGRESSIONS = [
    ['I', 'V', 'vi', 'IV'],
    ['vi', 'IV', 'I', 'V'],
    ['ii', 'V', 'I', 'I'],
    ['I', 'vi', 'IV', 'V'],
    ['I', 'IV', 'V', 'IV'],
    ['I', 'V', 'IV', 'V'],
]

const ROMAN_DEGREE = { I: 0, ii: 1, iii: 2, IV: 3, V: 4, vi: 5, vii: 6 }
const ROMAN_QUALITY = { I: '', ii: 'm', iii: 'm', IV: '', V: '', vi: 'm', vii: 'dim' }
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11]

function listenPlan(hasTake) {
    return { ms: WAND_LISTEN_MS, source: hasTake ? 'take' : 'mic' }
}

function mulberry32(seed) {
    let state = (seed >>> 0) || 1
    return function next() {
        state = (state + 0x6D2B79F5) | 0
        let t = Math.imul(state ^ (state >>> 15), 1 | state)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

/** Key, vocal range, and how busy the vocal rhythm is. */
function listenToVocal(samples, sampleRate, bpmHint) {
    const rate = sampleRate > 0 ? sampleRate : 44100
    const base = analyzeTake(samples, rate, bpmHint)
    const win = 2048
    const hop = 1024
    const pitches = []
    let onsets = 0
    let frames = 0
    let prev = 0
    const list = samples || []
    for (let start = 0; start + win <= list.length; start += hop) {
        frames += 1
        let energy = 0
        for (let i = 0; i < win; i += 8) energy += (list[start + i] || 0) * (list[start + i] || 0)
        const rms = Math.sqrt(energy / Math.max(1, win / 8))
        if (rms > 0.02 && rms > prev * 1.7) onsets += 1
        prev = rms
        if (rms < 0.012) continue
        const hz = estimatePitch(list.subarray ? list.subarray(start, start + win) : list, rate)
        if (hz > 75 && hz < 880) pitches.push(hz)
    }
    let lowHz = 196
    let highHz = 392
    if (pitches.length > 0) {
        pitches.sort(function (a, b) { return a - b })
        lowHz = pitches[Math.floor((pitches.length - 1) * 0.15)]
        highHz = pitches[Math.min(pitches.length - 1, Math.floor((pitches.length - 1) * 0.85))]
        if (!(highHz > lowHz)) highHz = lowHz * 1.2
    }
    const hist = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    for (let i = 0; i < pitches.length; i++) hist[pitchClass(pitches[i])] += 1
    let tonic = base.key
    let best = -1
    for (let i = 0; i < 12; i++) {
        if (hist[i] > best) {
            best = hist[i]
            tonic = i
        }
    }
    const names = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
    return {
        bpm: base.bpm,
        key: tonic,
        keyName: names[tonic],
        tonic: tonic,
        scale: 'Major',
        lowHz: lowHz,
        highHz: highHz,
        density: frames > 0 ? onsets / frames : 0.25,
        vocalVolume: 80,
        rms: base.rms,
        peak: base.peak,
    }
}

function chordSymbol(tonic, roman) {
    const names = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
    const pc = (tonic + MAJOR_STEPS[ROMAN_DEGREE[roman]]) % 12
    return names[pc] + (ROMAN_QUALITY[roman] || '')
}

function chordRoot(symbol) {
    const match = String(symbol || 'C').match(/^([A-G](?:#|b)?)/)
    return match ? match[1] : 'C'
}

function placeBelow(pcName, ceilingHz) {
    let chosen = pcName + '1'
    for (let oct = 1; oct <= 5; oct++) {
        const name = pcName + oct
        if (noteFreq(name) < ceilingHz) chosen = name
        else break
    }
    return chosen
}

function placeAbove(pcName, floorHz) {
    for (let oct = 2; oct <= 7; oct++) {
        const name = pcName + oct
        if (noteFreq(name) > floorHz) return name
    }
    return pcName + '6'
}

function underVocal(vocalVolume, wanted) {
    const vocal = vocalVolume > 0 ? vocalVolume : 80
    return Math.max(12, Math.min(wanted, vocal - 12))
}

/**
 * A seeded diatonic progression. Bass sits under the vocal, the pad stays
 * out of the way, and the drums leave space on the vocal hits.
 */
function buildLocalArrangement(profile, seed) {
    const info = profile || {}
    const tonic = Number.isFinite(info.tonic) ? info.tonic : (Number.isFinite(info.key) ? info.key : 0)
    const lowHz = info.lowHz > 40 ? info.lowHz : 196
    const highHz = info.highHz > lowHz ? info.highHz : lowHz * 2
    const density = info.density > 0 ? info.density : 0.25
    const vocalVolume = info.vocalVolume > 0 ? info.vocalVolume : 80
    const rng = mulberry32(seed)
    const pattern = PROGRESSIONS[Math.floor(rng() * PROGRESSIONS.length)]
    const chords = pattern.map(function (roman) { return chordSymbol(tonic, roman) })
    const roll = rng()
    const place = roll < 0.42 ? 'below' : roll < 0.84 ? 'above' : 'thin'
    const bassNotes = []
    const padNotes = []
    for (let i = 0; i < chords.length; i++) {
        const root = chordRoot(chords[i])
        bassNotes.push(placeBelow(root, lowHz * 0.92))
        if (place === 'above') padNotes.push(placeAbove(root, highHz * 1.9))
        else if (place === 'below') padNotes.push(placeBelow(root, lowHz * 0.98))
        else padNotes.push(placeAbove(root, lowHz * 0.8))
    }
    const drums = density > 0.45
        ? ['kick', 'rest', 'rest', 'rest', 'snare', 'rest', 'rest', 'rest']
        : ['kick', 'rest', 'hat', 'rest', 'snare', 'rest', 'hat', 'rest']
    return {
        chords: chords,
        barsEach: 2,
        place: place,
        parts: [
            {
                name: 'Wand bass',
                kind: 'bass',
                notes: bassNotes,
                pattern: [],
                startBar: 0,
                endBar: 8,
                volume: underVocal(vocalVolume, 50),
                thin: false,
            },
            {
                name: 'Wand drums',
                kind: 'drums',
                notes: [],
                pattern: drums,
                startBar: 0,
                endBar: 8,
                volume: underVocal(vocalVolume, 34),
                thin: false,
            },
            {
                name: 'Wand pad',
                kind: 'pad',
                notes: padNotes,
                pattern: [],
                startBar: 0,
                endBar: 8,
                volume: underVocal(vocalVolume, place === 'thin' ? 26 : 40),
                thin: place === 'thin',
            },
        ],
    }
}

function localWand(profile, seed, userTracks, now) {
    const arrangement = buildLocalArrangement(profile, seed)
    const built = arrangementToTracks(arrangement, userTracks, now)
    return {
        tracks: built.tracks,
        arrangement: built.arrangement,
        note: arrangement.chords.join(' – '),
        local: true,
    }
}

module.exports = {
    wandFailureMessage,
    LOCAL_NOTE,
    WAND_LISTEN_MS,
    analyzeTake,
    listenToVocal,
    listenPlan,
    buildLocalArrangement,
    localWand,
    estimatePitch,
    centsBetween,
    noteFreq,
    sanitizeArrangement,
    practiceArrangement,
    arrangementToTracks,
    resolveWand,
    renderPart,
    buildWandRequest,
}
