const assert = require('assert')
const test = require('node:test')
const {
    keyLabel,
    loopPosition,
    loopSeconds,
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

test('the clock wraps inside the loop', function () {
    const spot = loopPosition(5, 20, 8)
    assert.ok(Math.abs(spot.bar - 3) < 0.01)
    assert.ok(Math.abs(spot.left - 15) < 0.01)
    assert.ok(Math.abs(spot.progress - 0.25) < 0.001)
    const wrapped = loopPosition(25, 20, 8)
    assert.ok(Math.abs(wrapped.bar - 3) < 0.01)
})
