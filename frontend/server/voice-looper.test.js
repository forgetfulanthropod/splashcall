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
const { dbFromRms, micAudioConstraints, needsAudioResume } = require('../src/cards/voice-looper/capture')
const { encodeWav } = require('../src/cards/voice-looper/exportMix')
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

test('a WAV bounce starts with a RIFF header', function () {
    const wav = encodeWav(new Float32Array([0, 0.5, -0.5, 0]), 44100)
    assert.equal(String.fromCharCode(wav[0], wav[1], wav[2], wav[3]), 'RIFF')
    assert.equal(String.fromCharCode(wav[8], wav[9], wav[10], wav[11]), 'WAVE')
})

test('the clock wraps inside the loop', function () {
    const spot = loopPosition(5, 20, 8)
    assert.ok(Math.abs(spot.bar - 3) < 0.01)
    assert.ok(Math.abs(spot.left - 15) < 0.01)
    assert.ok(Math.abs(spot.progress - 0.25) < 0.001)
    const wrapped = loopPosition(25, 20, 8)
    assert.ok(Math.abs(wrapped.bar - 3) < 0.01)
})
