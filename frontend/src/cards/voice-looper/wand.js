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

function estimatePitch(samples, sampleRate) {
    const size = Math.min(samples.length, 4096)
    if (size < 512) return 0
    const minLag = Math.floor(sampleRate / 800)
    const maxLag = Math.min(Math.floor(sampleRate / 70), Math.floor(size / 2))
    let best = 0
    let bestLag = 0
    for (let lag = minLag; lag <= maxLag; lag += 2) {
        let corr = 0
        for (let i = 0; i < size - lag; i += 8) corr += (samples[i] || 0) * (samples[i + lag] || 0)
        if (corr > best) {
            best = corr
            bestLag = lag
        }
    }
    if (!(bestLag > 0) || best <= 0) return 0
    return sampleRate / bestLag
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
        pattern: pattern.length > 0 ? pattern : ['kick', 'hat', 'snare', 'hat'],
        startBar: Math.max(0, Math.round(Number(part && part.startBar) || 0)),
        endBar: Math.max(1, Math.round(Number(part && part.endBar) || 8)),
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
        volume: part.kind === 'drums' ? 70 : 75,
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
            if (into < 0.04) {
                const env = 1 - into / 0.04
                const noise = ((i * 17) % 100) / 100 - 0.5
                out[i] = hit === 'hat' ? noise * env * 0.3 : Math.sin(2 * Math.PI * (hit === 'snare' ? 180 : 70) * i / rate) * env * 0.6
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
        out[i] = part.kind === 'bass' ? tone * 0.45 : tone * 0.22
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

module.exports = {
    wandFailureMessage,
    LOCAL_NOTE,
    analyzeTake,
    sanitizeArrangement,
    practiceArrangement,
    arrangementToTracks,
    resolveWand,
    renderPart,
    buildWandRequest,
}
