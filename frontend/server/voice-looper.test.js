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

test('the clock wraps inside the loop', function () {
    const spot = loopPosition(5, 20, 8)
    assert.ok(Math.abs(spot.bar - 3) < 0.01)
    assert.ok(Math.abs(spot.left - 15) < 0.01)
    assert.ok(Math.abs(spot.progress - 0.25) < 0.001)
    const wrapped = loopPosition(25, 20, 8)
    assert.ok(Math.abs(wrapped.bar - 3) < 0.01)
})
