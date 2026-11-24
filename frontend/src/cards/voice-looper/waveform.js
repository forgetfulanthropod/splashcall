/**
 * Peak drawing and the quiet-take fix. No browser APIs at load time,
 * so the phone and the node tests share it.
 */

function rmsOf(samples) {
    if (samples == null || samples.length === 0) return 0
    let sum = 0
    for (let i = 0; i < samples.length; i++) {
        const value = samples[i] || 0
        sum += value * value
    }
    return Math.sqrt(sum / samples.length)
}

function peakOf(samples) {
    let peak = 0
    if (samples == null) return 0
    for (let i = 0; i < samples.length; i++) {
        const value = samples[i] || 0
        const abs = value < 0 ? -value : value
        if (abs > peak) peak = abs
    }
    return peak
}

/**
 * A phone mic with auto-gain off often lands around RMS 0.02.
 * That passes the silence check and then disappears on a speaker.
 * Lift a real take toward a peak of 0.7. Leave an already-loud take alone.
 */
function makeup(samples) {
    const peak = peakOf(samples)
    const rms = rmsOf(samples)
    if (!(rms >= 0.002) || !(peak > 0.0001) || peak >= 0.45) return samples
    const gain = Math.min(12, 0.7 / peak)
    if (!(gain > 1.05)) return samples
    const out = new Float32Array(samples.length)
    for (let i = 0; i < samples.length; i++) {
        let value = (samples[i] || 0) * gain
        if (value > 1) value = 1
        if (value < -1) value = -1
        out[i] = value
    }
    return out
}

/** Min/max pairs, one pair per pixel column. */
function peaksPerPixel(samples, pixels) {
    const count = Math.max(1, pixels | 0)
    const out = new Float32Array(count * 2)
    const length = samples == null ? 0 : samples.length
    if (length === 0) return out
    for (let i = 0; i < count; i++) {
        const start = Math.floor(i * length / count)
        let end = Math.floor((i + 1) * length / count)
        if (end <= start) end = start + 1
        let min = 0
        let max = 0
        for (let j = start; j < end && j < length; j++) {
            const value = samples[j] || 0
            if (value < min) min = value
            if (value > max) max = value
        }
        out[i * 2] = min
        out[i * 2 + 1] = max
    }
    return out
}

function waveformHasEnergy(peaks) {
    if (peaks == null) return false
    let span = 0
    for (let i = 0; i + 1 < peaks.length; i += 2) {
        const gap = peaks[i + 1] - peaks[i]
        if (gap > span) span = gap
    }
    return span > 0.05
}

/** A short vowel, loud enough that the capture test does not depend on makeup. */
function testVoice(sampleRate, seconds) {
    const rate = sampleRate > 0 ? sampleRate : 44100
    const duration = seconds > 0 ? seconds : 0.5
    const length = Math.max(1, Math.floor(rate * duration))
    const out = new Float32Array(length)
    for (let i = 0; i < length; i++) {
        const t = i / rate
        const attack = Math.min(1, i / (rate * 0.02))
        const release = Math.min(1, (length - 1 - i) / (rate * 0.03))
        const env = attack < release ? attack : release
        const vowel = Math.sin(2 * Math.PI * 196 * t)
            + 0.45 * Math.sin(2 * Math.PI * 392 * t)
            + 0.22 * Math.sin(2 * Math.PI * 588 * t)
        out[i] = vowel * 0.5 * (env > 0 ? env : 0)
    }
    return out
}

function drawWaveform(canvas, peaks, color) {
    const ctx = canvas.getContext('2d')
    if (ctx == null) return
    const width = canvas.width
    const height = canvas.height
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#e7edf3'
    ctx.fillRect(0, 0, width, height)
    ctx.strokeStyle = '#c5ced6'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, height / 2)
    ctx.lineTo(width, height / 2)
    ctx.stroke()
    paintPeaks(ctx, peaks, 0, width, width, color || '#1f6b3a', height)
}

/**
 * One recorded loop, tiled across the bars it occupies.
 * Empty audio stays a flat line instead of a solid block.
 */
function drawLane(canvas, peaks, songBars, startBar, endBar, loopBars) {
    const ctx = canvas.getContext('2d')
    if (ctx == null) return
    const width = canvas.width
    const height = canvas.height
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#e7edf3'
    ctx.fillRect(0, 0, width, height)
    ctx.strokeStyle = '#d5dbe3'
    ctx.beginPath()
    ctx.moveTo(0, height / 2)
    ctx.lineTo(width, height / 2)
    ctx.stroke()
    if (!(songBars > 0)) return
    const x0 = (Math.max(0, startBar) / songBars) * width
    const x1 = (Math.max(startBar + 0.05, endBar) / songBars) * width
    const tileBars = loopBars === 'free' ? Math.max(0.25, endBar - startBar) : loopBars
    const tile = (tileBars / songBars) * width
    if (!(tile > 1) || !(x1 > x0)) return
    const start = Math.max(0, Math.floor(x0))
    const stop = Math.min(width, Math.ceil(x1))
    paintPeaks(ctx, peaks, start - x0, stop - start, tile, '#1f6b3a', height, start)
}

function paintPeaks(ctx, peaks, origin, span, tile, color, height, xOffset) {
    const buckets = peaks == null ? 0 : Math.floor(peaks.length / 2)
    if (buckets === 0 || !(span > 0) || !(tile > 0)) return
    const left = xOffset == null ? 0 : xOffset
    ctx.fillStyle = color
    for (let i = 0; i < span; i++) {
        const into = ((origin + i) % tile + tile) % tile
        const bucket = Math.min(buckets - 1, Math.floor((into / tile) * buckets))
        const min = peaks[bucket * 2]
        const max = peaks[bucket * 2 + 1]
        const yMax = (0.5 - max * 0.46) * height
        const yMin = (0.5 - min * 0.46) * height
        const top = yMax < yMin ? yMax : yMin
        const bar = Math.abs(yMin - yMax)
        ctx.fillRect(left + i, top, 1, bar > 1 ? bar : 1)
    }
}

module.exports = {
    rmsOf,
    peakOf,
    makeup,
    peaksPerPixel,
    waveformHasEnergy,
    testVoice,
    drawWaveform,
    drawLane,
}
