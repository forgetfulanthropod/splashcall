const assert = require('assert')
const test = require('node:test')
const {
    alignedOffset,
    barSeconds,
    keyLabel,
    loopPosition,
    loopSeconds,
    recordDownbeat,
    scalePitchClasses,
    targetFrequency,
} = require('../src/cards/voice-looper/theory')
const { TUNER_SOURCE } = require('../src/cards/voice-looper/workletSource')
const { dbFromRms, micAudioConstraints, needsAudioResume } = require('../src/cards/voice-looper/capture')
const { encodeWav } = require('../src/cards/voice-looper/exportMix')
const { arrangementToTracks, centsBetween, estimatePitch, listenPlan, listenToVocal, localWand, noteFreq, renderPart, resolveWand, wandFailureMessage, WAND_LISTEN_MS } = require('../src/cards/voice-looper/wand')
const { makeup, peaksPerPixel, rmsOf, testVoice, waveformHasEnergy } = require('../src/cards/voice-looper/waveform')
const { createArrangement } = require('../server/wand')
const { defaultTrack, freshLibrary } = require('../src/cards/voice-looper/song')
const {
    barsForMinutes,
    chordAt,
    createMemoryLibrary,
    driveAt,
    migrate,
    parseProgression,
    placement,
    pushRevision,
    restoreRevision,
    schedulePoints,
    songSeconds,
} = require('../src/cards/voice-looper/song')

test('eight bars at 96 BPM is a 20 second loop', function () {
    assert.equal(loopSeconds(96, 8), 20)
    assert.equal(loopSeconds(120, 4), 8)
})

test('C major keeps the white keys and a slightly flat A snaps to A', function () {
    const mask = scalePitchClasses(0, 'Major')
    assert.deepEqual(mask, [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1])
    const target = targetFrequency(430, mask)
    assert.ok(Math.abs(target - 440) < 1)
    assert.equal(keyLabel(0, 'Major'), 'C major')
})

test('at 90 BPM a 1-bar loop repeats four times inside one 4-bar loop', function () {
    const bar = barSeconds(90)
    assert.ok(Math.abs(bar - (4 * 60 / 90)) < 1e-9)
    assert.ok(Math.abs(loopSeconds(90, 1) - bar) < 1e-9)
    assert.ok(Math.abs(loopSeconds(90, 2) - bar * 2) < 1e-9)
    assert.ok(Math.abs(loopSeconds(90, 4) - bar * 4) < 1e-9)
    assert.ok(Math.abs(loopSeconds(90, 8) - bar * 8) < 1e-9)
    const elapsed = loopSeconds(90, 4)
    assert.ok(Math.abs(alignedOffset(elapsed, loopSeconds(90, 1))) < 1e-9)
    assert.ok(Math.abs(alignedOffset(elapsed, loopSeconds(90, 4))) < 1e-9)
    assert.ok(Math.abs(elapsed / loopSeconds(90, 1) - 4) < 1e-9)
    assert.ok(Math.abs(alignedOffset(bar, loopSeconds(90, 4)) - bar) < 1e-9)
})

test('a count-in starts the take on a downbeat one bar later', function () {
    const bar = 2
    assert.equal(recordDownbeat(10, false, 0, bar, true), 12)
    assert.equal(recordDownbeat(10, false, 0, bar, false), 10)
    assert.equal(recordDownbeat(10.2, true, 10, bar, false), 12)
    assert.equal(recordDownbeat(10.2, true, 10, bar, true), 14)
})

test('the mic is recorded raw so speaker playback is not cancelled', function () {
    const audio = micAudioConstraints()
    assert.equal(audio.echoCancellation, false)
    assert.equal(audio.noiseSuppression, false)
    assert.equal(audio.autoGainControl, false)
    assert.equal(audio.googEchoCancellation, false)
    assert.equal(audio.googAutoGainControl, false)
    assert.equal(audio.channelCount, 1)
    assert.equal(needsAudioResume('suspended'), true)
    assert.equal(needsAudioResume('interrupted'), true)
    assert.equal(needsAudioResume('running'), false)
    assert.ok(Math.abs(dbFromRms(1) - 0) < 0.001)
    assert.ok(dbFromRms(0.1) < 0)
    assert.equal(dbFromRms(0), -96)
})

test('a gap rests the loop and the end bar stops it', function () {
    const bpm = 90
    const loop = 2
    const gaps = { preGapBeats: 2, preGapMs: 0, postGapBeats: 0, postGapMs: 0 }
    // 2 beats at 90 BPM is 4/3 seconds. The loop itself is 2 seconds.
    const before = placement(0.5, bpm, loop, gaps, 0, 8)
    assert.equal(before.sounding, false)
    const during = placement(1.5, bpm, loop, gaps, 0, 8)
    assert.equal(during.sounding, true)
    assert.ok(Math.abs(during.offset - (1.5 - 4 / 3)) < 0.001)
    const oneBar = songSeconds(bpm, 1)
    const stopped = placement(oneBar * 4 + 0.2, bpm, loop, gaps, 0, 4)
    assert.equal(stopped.sounding, false)
    const points = schedulePoints(0, oneBar * 2, bpm, loop, gaps, 0, 8)
    assert.ok(points.length >= 1)
    assert.ok(points[0].songTime > 1)
    assert.ok(barsForMinutes(bpm, 8) * oneBar >= 8 * 60 - 1)
})

test('chords walk the progression and a drawn drive rises', function () {
    const chords = parseProgression('I V vi IV')
    assert.equal(chords.length, 4)
    assert.equal(chords[2].quality, 'min')
    const names = parseProgression('C G Am F')
    assert.equal(names[2].label, 'Am')
    const bar = barSeconds(90)
    const first = chordAt(0.1, 90, chords, 1)
    const second = chordAt(bar + 0.1, 90, chords, 1)
    assert.equal(first.label, 'I')
    assert.equal(second.label, 'V')
    assert.equal(second.scale, 'Major')
    const named = chordAt(bar * 2 + 0.1, 90, names, 1)
    assert.equal(named.scale, 'Minor')
    assert.ok(Math.abs(driveAt(0, [{ x: 0, y: 0 }, { x: 1, y: 1 }])) < 0.001)
    assert.ok(Math.abs(driveAt(0.5, [{ x: 0, y: 0 }, { x: 1, y: 1 }]) - 0.5) < 0.001)
    assert.ok(Math.abs(driveAt(1, [{ x: 0, y: 0 }, { x: 1, y: 1 }]) - 1) < 0.001)
})

test('a song round-trips and a restore keeps the previous take', function () {
    const library = migrate({
        version: 1,
        activeId: 'song-1',
        songs: [{
            id: 'song-1',
            name: 'Demo',
            bpm: 100,
            songBars: 16,
            tracks: [{ id: 'vocals', name: 'Vocals', bars: 2, audioId: 'a1', preGapBeats: 1, startBar: 0, endBar: 8 }],
            chords: [{ root: 0, quality: 'maj', label: 'C' }],
        }],
    })
    const again = migrate(JSON.parse(JSON.stringify(library)))
    assert.equal(again.activeId, 'song-1')
    assert.equal(again.songs[0].bpm, 100)
    assert.equal(again.songs[0].tracks[0].preGapBeats, 1)
    assert.equal(again.songs[0].tracks[0].audioId, 'a1')
    const audio = createMemoryLibrary()
    const id = audio.put([0.2, -0.2, 0.2, -0.2], 44100)
    assert.equal(audio.refcount(id), 1)
    audio.put([0.2, -0.2, 0.2, -0.2], 44100)
    assert.equal(audio.refcount(id), 2)
    audio.release(id)
    assert.equal(audio.refcount(id), 1)
    const song = again.songs[0]
    song.revisions = pushRevision(song, 'Recorded Vocals', 10)
    const restored = restoreRevision(song, song.revisions[0], 20)
    assert.equal(restored.tracks[0].name, 'Vocals')
    assert.ok(restored.revisions.some((revision) => revision.label === 'Before restore'))
    assert.equal(migrate(null).songs.length, 1)
})

test('a new song starts with one empty track', function () {
    const song = freshLibrary().songs[0]
    assert.equal(song.tracks.length, 1)
    assert.equal(song.tracks[0].bars, 'free')
    assert.equal(song.tracks[0].audioId, '')
    assert.equal(song.countIn, false)
})

test('the wand adds parts and leaves the recording in place', function () {
    const user = [defaultTrack({ id: 'vocals', name: 'My voice', audioId: 'take-1' })]
    const built = arrangementToTracks({
        chords: ['C', 'G', 'Am', 'F'],
        barsEach: 2,
        parts: [
            { name: 'Bass', kind: 'bass', notes: ['C2', 'G2'], startBar: 0, endBar: 8 },
            { name: 'Drums', kind: 'drums', pattern: ['kick', 'hat'], startBar: 0, endBar: 8 },
        ],
    }, user, 9)
    assert.equal(built.tracks[0].id, 'vocals')
    assert.equal(built.tracks[0].audioId, 'take-1')
    assert.equal(built.tracks[0].wand, false)
    assert.equal(built.tracks.filter((track) => track.wand).length, 2)
    const bass = renderPart(built.arrangement.parts[0], 90, 8000)
    assert.ok(bass.length > 1000)
    let energy = 0
    for (let i = 0; i < bass.length; i += 10) energy += bass[i] * bass[i]
    assert.ok(energy > 0)
    assert.equal(wandFailureMessage(403), 'Magic wand needs xAI credits')
})

test('the wand listens for 2 seconds and each tap builds a new progression', function () {
    assert.equal(WAND_LISTEN_MS, 2000)
    assert.deepEqual(listenPlan(true), { ms: 2000, source: 'take' })
    assert.deepEqual(listenPlan(false), { ms: 2000, source: 'mic' })
    const profile = { tonic: 0, key: 0, keyName: 'C', lowHz: 220, highHz: 440, density: 0.7, vocalVolume: 80, bpm: 90 }
    const user = [defaultTrack({ id: 'vocals', name: 'My voice', audioId: 'take-1', volume: 80, bars: 'free' })]
    const first = localWand(profile, 1, user, 11)
    const second = localWand(profile, 2, user, 12)
    assert.equal(first.tracks[0].id, 'vocals')
    assert.equal(first.tracks[0].audioId, 'take-1')
    assert.equal(first.tracks[0].wand, false)
    assert.notEqual(wandStamp(first), wandStamp(second))
    assert.equal(wandStamp(localWand(profile, 2, user, 99)), wandStamp(second))
    assert.equal(first.note, first.arrangement.chords.join(' – '))
    first.arrangement.parts.forEach((part) => {
        assert.ok(part.volume < 80)
        if (part.kind === 'bass') {
            part.notes.forEach((note) => assert.ok(noteFreq(note) < profile.lowHz * 0.98))
        }
        if (part.kind === 'pad' && !part.thin) {
            const below = part.notes.every((note) => noteFreq(note) < profile.lowHz * 0.98)
            const above = part.notes.every((note) => noteFreq(note) > profile.highHz * 1.8)
            assert.ok(below || above)
        }
        if (part.kind === 'drums') assert.ok(part.pattern.indexOf('rest') >= 0)
    })
    const heard = listenToVocal(testVoice(8000, 0.6), 8000, 90)
    assert.ok(heard.lowHz > 70 && heard.highHz >= heard.lowHz)
    assert.ok(heard.density >= 0 && heard.density <= 1)
})

function wandStamp(built) {
    return built.arrangement.chords.join(',') + '|' + built.arrangement.parts.map((part) => (part.notes || []).join('.') + '/' + (part.pattern || []).join('.')).join(';')
}

function runTuner(samples, sampleRate, mask) {
    global.sampleRate = sampleRate
    let Processor = null
    const chunks = []
    global.AudioWorkletProcessor = class {
        constructor() {
            this.port = {
                onmessage: null,
                postMessage(msg) { if (msg && msg.samples) chunks.push(msg.samples) },
            }
        }
    }
    global.registerProcessor = function (_name, cls) { Processor = cls }
    eval(TUNER_SOURCE)
    const node = new Processor()
    node.port.onmessage({ data: { type: 'config', strength: 1, bypass: false, mask } })
    node.port.onmessage({ data: { type: 'record', on: true, delaySamples: 0 } })
    const block = 128
    const input = new Float32Array(block)
    for (let at = 0; at < samples.length; at += block) {
        for (let j = 0; j < block; j++) input[j] = at + j < samples.length ? samples[at + j] : 0
        node.process([[input]], [[new Float32Array(block)]])
    }
    const recorded = new Float32Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0))
    let offset = 0
    chunks.forEach((chunk) => { recorded.set(chunk, offset); offset += chunk.length })
    return recorded
}

test('auto-tune pulls 450 Hz onto A 440 through the worklet', function () {
    const rate = 48000
    const length = Math.floor(rate * 0.85)
    const tone = new Float32Array(length)
    for (let i = 0; i < length; i++) tone[i] = Math.sin(2 * Math.PI * 450 * i / rate) * 0.5
    const recorded = runTuner(tone, rate, scalePitchClasses(9, 'Major'))
    const tail = recorded.subarray(Math.floor(recorded.length * 0.65))
    const hz = estimatePitch(tail, rate)
    const cents = Math.abs(centsBetween(hz, 440))
    assert.ok(hz > 0, 'no pitch')
    assert.ok(cents <= 15, '450 Hz landed on ' + hz.toFixed(1) + ' Hz (' + cents.toFixed(1) + ' cents)')
})

test('a failed wand still adds local parts and keeps the recording', function () {
    const user = [defaultTrack({ id: 'vocals', name: 'My voice', audioId: 'take-1', bars: 'free' })]
    const features = { bpm: 90, key: 0, keyName: 'C', scale: 'Major', loopSeconds: 2, rms: 0.2, peak: 0.4, bars: 1 }
    const failed = resolveWand(null, features, user, 5)
    assert.equal(failed.local, true)
    assert.ok(failed.note.indexOf('AI fill needs xAI credits') >= 0)
    assert.equal(failed.tracks[0].id, 'vocals')
    assert.equal(failed.tracks[0].audioId, 'take-1')
    assert.equal(failed.tracks[0].wand, false)
    assert.ok(failed.tracks.filter((track) => track.wand).length >= 2)
    const again = resolveWand({ arrangement: null }, features, user, 5)
    assert.equal(again.local, true)
    assert.deepEqual(again.arrangement.parts.map((part) => part.name), failed.arrangement.parts.map((part) => part.name))
    const live = resolveWand({
        arrangement: {
            chords: ['D'],
            barsEach: 2,
            parts: [{ name: 'Only bass', kind: 'bass', notes: ['D2'], pattern: [], startBar: 0, endBar: 4 }],
        },
        mock: false,
    }, features, user, 9)
    assert.equal(live.local, false)
    assert.equal(live.note.indexOf('AI fill needs xAI credits'), -1)
    assert.equal(live.tracks[0].audioId, 'take-1')
    assert.equal(live.tracks.filter((track) => track.wand).length, 1)
    assert.equal(live.tracks[1].name, 'Only bass')
})

test('a 403 from xAI is named instead of a generic failure', async function () {
    const result = await createArrangement({ bpm: 90, keyName: 'C', rms: 0.2 }, {
        apiKey: 'test-key',
        fetchImpl: async function () {
            return { status: 403, ok: false, json: async function () { return {} } }
        },
    })
    assert.equal(result.status, 403)
    assert.equal(result.body.error, 'Magic wand needs xAI credits')
})

test('a WAV bounce starts with a RIFF header', function () {
    const wav = encodeWav(new Float32Array([0, 0.5, -0.5, 0]), 44100)
    assert.equal(String.fromCharCode(wav[0], wav[1], wav[2], wav[3]), 'RIFF')
    assert.equal(String.fromCharCode(wav[8], wav[9], wav[10], wav[11]), 'WAVE')
})

test('a take that ends mid-cycle starts now instead of a lap later', function () {
    const points = schedulePoints(1.2, 2.2, 90, 0.5, {}, 0, 8)
    assert.ok(points.length >= 2)
    assert.ok(points[0].songTime >= 1.2 - 0.001)
    assert.ok(points[0].songTime < 1.3)
    assert.ok(points[0].offset > 0.15)
    assert.ok(points[0].duration > 0.1)
    assert.ok(points[1].songTime >= points[0].songTime + points[0].duration - 0.001)
})

test('a quiet phone take is lifted and a loud test voice is left alone', function () {
    const quiet = new Float32Array(2000)
    for (let i = 0; i < quiet.length; i++) quiet[i] = Math.sin(i / 7) * 0.021
    const lifted = makeup(quiet)
    assert.ok(rmsOf(quiet) < 0.03)
    assert.ok(rmsOf(lifted) > 0.15)
    assert.ok(peakOfSafe(lifted) <= 1)
    const voice = testVoice(8000, 0.4)
    assert.ok(rmsOf(voice) > 0.08)
    assert.equal(makeup(voice), voice)
    const peaks = peaksPerPixel(voice, 48)
    assert.equal(waveformHasEnergy(peaks), true)
    assert.equal(waveformHasEnergy(peaksPerPixel(new Float32Array(100), 16)), false)
})

test('an autosaved demo song opens empty, and a real take is kept once', function () {
    const demo = migrate({
        version: 1,
        activeId: 'song-1',
        songs: [{
            id: 'song-1',
            name: 'Song 1',
            tracks: [
                { id: 'vocals', name: 'Vocals' },
                { id: 'harmony', name: 'Harmony' },
                { id: 'beatbox', name: 'Beatbox' },
                { id: 'bass', name: 'Bass' },
                { id: 'track-5', name: 'Track 5' },
            ],
        }],
    })
    assert.equal(demo.songs[0].tracks.length, 1)
    assert.equal(demo.songs[0].tracks[0].name, 'Track 1')
    assert.equal(demo.songs[0].tracks[0].audioId, '')
    assert.equal(demo.songs[0].tracks.some((track) => track.name === 'Harmony'), false)
    const kept = migrate({
        version: 1,
        activeId: 'song-1',
        songs: [{
            id: 'song-1',
            name: 'Song 1',
            tracks: [
                { id: 'vocals', name: 'Vocals', audioId: 'take-quiet' },
                { id: 'harmony', name: 'Harmony' },
                { id: 'beatbox', name: 'Beatbox' },
                { id: 'bass', name: 'Bass' },
                { id: 'track-5', name: 'Track 5' },
            ],
        }],
    })
    assert.equal(kept.songs[0].tracks.length, 1)
    assert.equal(kept.songs[0].tracks[0].audioId, 'take-quiet')
    assert.equal(kept.songs[0].tracks.some((track) => track.name === 'Beatbox'), false)
    assert.equal(kept.songs[0].tracks.some((track) => track.name === 'Track 5'), false)
})

function peakOfSafe(samples) {
    let peak = 0
    for (let i = 0; i < samples.length; i++) {
        const abs = samples[i] < 0 ? -samples[i] : samples[i]
        if (abs > peak) peak = abs
    }
    return peak
}

test('the clock wraps inside the loop', function () {
    const spot = loopPosition(5, 20, 8)
    assert.ok(Math.abs(spot.bar - 3) < 0.01)
    assert.ok(Math.abs(spot.left - 15) < 0.01)
    assert.ok(Math.abs(spot.progress - 0.25) < 0.001)
    const wrapped = loopPosition(25, 20, 8)
    assert.ok(Math.abs(wrapped.bar - 3) < 0.01)
})
