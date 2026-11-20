/**
 * Note names, scales, and loop clock. No audio here, so the phone and the
 * tests share one copy.
 */

const NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

const SCALES = {
    Major: [0, 2, 4, 5, 7, 9, 11],
    Minor: [0, 2, 3, 5, 7, 8, 10],
    Dorian: [0, 2, 3, 5, 7, 9, 10],
    Mixolydian: [0, 2, 4, 5, 7, 9, 10],
    Pentatonic: [0, 2, 4, 7, 9],
}

function noteName(root) {
    const index = ((root % 12) + 12) % 12
    return NOTES[index]
}

function scalePitchClasses(root, scale) {
    const steps = SCALES[scale] || SCALES.Major
    const mask = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    for (let i = 0; i < steps.length; i++) {
        mask[(root + steps[i]) % 12] = 1
    }
    return mask
}

function freqToMidi(freq) {
    return 69 + 12 * Math.log(freq / 440) / Math.LN2
}

function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12)
}

/** Nearest scale note, as a frequency. 0 means there was nothing to snap. */
function targetFrequency(freq, mask) {
    if (!(freq > 0) || !mask) return 0
    const midi = freqToMidi(freq)
    const base = Math.round(midi)
    let best = midi
    let dist = 100
    for (let n = base - 6; n <= base + 6; n++) {
        const pc = ((n % 12) + 12) % 12
        if (!mask[pc]) continue
        const gap = Math.abs(n - midi)
        if (gap < dist) {
            dist = gap
            best = n
        }
    }
    return midiToFreq(best)
}

function loopSeconds(bpm, bars) {
    const safeBpm = bpm > 0 ? bpm : 96
    const safeBars = bars > 0 ? bars : 8
    return safeBars * 4 * (60 / safeBpm)
}

function loopPosition(elapsed, seconds, bars) {
    const length = seconds > 0 ? seconds : 1
    const wrapped = ((elapsed % length) + length) % length
    const barCount = bars > 0 ? bars : 1
    return {
        bar: (wrapped / length) * barCount + 1,
        left: length - wrapped,
        progress: wrapped / length,
    }
}

function keyLabel(root, scale) {
    return noteName(root) + ' ' + String(scale || 'Major').toLowerCase()
}

module.exports = {
    NOTES,
    SCALES,
    noteName,
    scalePitchClasses,
    targetFrequency,
    loopSeconds,
    loopPosition,
    keyLabel,
}
