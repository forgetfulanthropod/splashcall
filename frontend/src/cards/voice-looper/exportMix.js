/**
 * Bounce the arrangement offline, then hand back a WAV or an AAC .m4a.
 * AAC needs WebCodecs. Everything else gets a WAV and is told so.
 */

const { schedulePoints, shaperSamples, songSeconds } = require('./song')

function resample(samples, fromRate, toRate) {
    if (!(fromRate > 0) || fromRate === toRate) return samples
    const length = Math.max(1, Math.round(samples.length * toRate / fromRate))
    const out = new Float32Array(length)
    for (let i = 0; i < length; i++) {
        const pos = i * fromRate / toRate
        const left = Math.floor(pos)
        const frac = pos - left
        const a = samples[Math.min(samples.length - 1, left)] || 0
        const b = samples[Math.min(samples.length - 1, left + 1)] || 0
        out[i] = a + (b - a) * frac
    }
    return out
}

function encodeWav(samples, sampleRate) {
    const bytes = new ArrayBuffer(44 + samples.length * 2)
    const view = new DataView(bytes)
    const text = (offset, value) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)) }
    text(0, 'RIFF')
    view.setUint32(4, 36 + samples.length * 2, true)
    text(8, 'WAVE')
    text(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * 2, true)
    view.setUint16(32, 2, true)
    view.setUint16(34, 16, true)
    text(36, 'data')
    view.setUint32(40, samples.length * 2, true)
    for (let i = 0; i < samples.length; i++) {
        const clamped = Math.max(-1, Math.min(1, samples[i] || 0))
        view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
    }
    return new Uint8Array(bytes)
}

function box(type, payload) {
    const out = new Uint8Array(8 + payload.length)
    const view = new DataView(out.buffer)
    view.setUint32(0, out.length)
    out[4] = type.charCodeAt(0)
    out[5] = type.charCodeAt(1)
    out[6] = type.charCodeAt(2)
    out[7] = type.charCodeAt(3)
    out.set(payload, 8)
    return out
}

function concat(parts) {
    let length = 0
    parts.forEach((part) => { length += part.length })
    const out = new Uint8Array(length)
    let at = 0
    parts.forEach((part) => { out.set(part, at); at += part.length })
    return out
}

function u32(value) {
    const out = new Uint8Array(4)
    new DataView(out.buffer).setUint32(0, value)
    return out
}

function u16(value) {
    const out = new Uint8Array(2)
    new DataView(out.buffer).setUint16(0, value)
    return out
}

function zeros(length) {
    return new Uint8Array(length)
}

/** One AAC audio track, frames already encoded, description is the AudioSpecificConfig. */
function buildAacMp4(frames, sampleRate, description) {
    const frameDur = 1024
    const sizes = frames.map((frame) => frame.length)
    const total = sizes.reduce((sum, size) => sum + size, 0)
    const mdat = box('mdat', concat(frames))
    const asc = description instanceof Uint8Array ? description : new Uint8Array(description || [])
    const esds = box('esds', concat([
        new Uint8Array([0, 0, 0, 0]),
        new Uint8Array([0x03, 0x80, 0x80, 0x80, asc.length + 21, 0, 1, 0]),
        new Uint8Array([0x04, 0x80, 0x80, 0x80, asc.length + 15, 0x40, 0x15, 0, 0, 0, 0, 0, 1, 0xF4, 0, 0, 0]),
        new Uint8Array([0x05, 0x80, 0x80, 0x80, asc.length]),
        asc,
        new Uint8Array([0x06, 0x80, 0x80, 0x80, 1, 2]),
    ]))
    const mp4a = box('mp4a', concat([
        zeros(6),
        u16(1),
        zeros(8),
        u16(1),
        u16(16),
        zeros(4),
        u32(sampleRate << 16),
        esds,
    ]))
    const stsd = box('stsd', concat([u32(0), u32(1), mp4a]))
    const stts = box('stts', concat([u32(0), u32(1), u32(frames.length), u32(frameDur)]))
    const stsc = box('stsc', concat([u32(0), u32(1), u32(1), u32(1), u32(1)]))
    const stszBody = [u32(0), u32(0), u32(frames.length)]
    sizes.forEach((size) => stszBody.push(u32(size)))
    const stsz = box('stsz', concat(stszBody))
    const stco = box('stco', concat([u32(0), u32(1), u32(0)]))
    const stbl = box('stbl', concat([stsd, stts, stsc, stsz, stco]))
    const dref = box('dref', concat([u32(0), u32(1), box('url ', concat([u32(1)]))]))
    const dinf = box('dinf', dref)
    const smhd = box('smhd', zeros(8))
    const minf = box('minf', concat([smhd, dinf, stbl]))
    const mdhd = box('mdhd', concat([
        u32(0), u32(0), u32(0), u32(sampleRate), u32(frames.length * frameDur), u16(0x55c4), u16(0),
    ]))
    const hdlr = box('hdlr', concat([u32(0), u32(0), new Uint8Array([0x73, 0x6f, 0x75, 0x6e]), zeros(12), new Uint8Array([0])]))
    const mdia = box('mdia', concat([mdhd, hdlr, minf]))
    const tkhd = box('tkhd', concat([
        u32(0x00000007), u32(0), u32(0), u32(1), u32(0), u32(frames.length * frameDur * 1000 / sampleRate),
        zeros(8), u16(0), u16(0), u16(0), u16(0),
        u32(0x00010000), zeros(36), u32(0), u32(0),
    ]))
    const trak = box('trak', concat([tkhd, mdia]))
    const mvhd = box('mvhd', concat([
        u32(0), u32(0), u32(0), u32(1000), u32(Math.round(frames.length * frameDur * 1000 / sampleRate)),
        u32(0x00010000), u16(0x0100), u16(0), zeros(8),
        u32(0x00010000), zeros(36), u32(2),
    ]))
    const moov = box('moov', concat([mvhd, trak]))
    const ftyp = box('ftyp', concat([
        new Uint8Array([0x4d, 0x34, 0x41, 0x20]),
        u32(0),
        new Uint8Array([0x4d, 0x34, 0x41, 0x20, 0x69, 0x73, 0x6f, 0x6d]),
    ]))
    const file = concat([ftyp, moov, mdat])
    // Point the chunk offset at the audio inside mdat (header is 8 bytes).
    const view = new DataView(file.buffer)
    const mdatAt = ftyp.length + moov.length
    // stco is the last box; its single offset field is the last 4 bytes of moov before mdat... 
    // Easier: write the offset into the placeholder we can find by scanning is fragile.
    // The stco payload's offset sits at a known place: end of moov minus 4.
    view.setUint32(ftyp.length + moov.length - 4, mdatAt + 8)
    return file
}

async function renderMix(song, clips, sampleRate, onProgress) {
    const seconds = Math.min(songSeconds(song.bpm, song.songBars), 12 * 60)
    const rate = sampleRate > 0 ? sampleRate : 44100
    const length = Math.max(1, Math.ceil(seconds * rate))
    const offline = new OfflineAudioContext(1, length, rate)
    song.tracks.forEach((track) => {
        const clip = clips[track.id]
        if (clip == null || track.muted || clip.samples.length === 0) return
        const samples = resample(clip.samples, clip.rate, rate)
        const buffer = offline.createBuffer(1, samples.length, rate)
        buffer.getChannelData(0).set(samples)
        const dry = offline.createGain()
        const wet = offline.createGain()
        const shaper = offline.createWaveShaper()
        const level = track.volume / 100
        dry.gain.value = (1 - track.distort.mix) * level
        wet.gain.value = track.distort.mix * level
        const curve = shaperSamples(driveOf(track))
        shaper.curve = Float32Array.from(curve)
        dry.connect(offline.destination)
        shaper.connect(wet)
        wet.connect(offline.destination)
        const points = schedulePoints(0, seconds, song.bpm, samples.length / rate, track, track.startBar, Math.min(track.endBar, song.songBars))
        points.forEach((point) => {
            if (!(point.duration > 0.01)) return
            const source = offline.createBufferSource()
            source.buffer = buffer
            source.connect(dry)
            if (track.distort.mix > 0) source.connect(shaper)
            source.start(point.songTime, Math.min(point.offset, buffer.duration - 0.001), point.duration)
        })
    })
    if (onProgress) onProgress(0.35)
    const rendered = await offline.startRendering()
    if (onProgress) onProgress(0.7)
    return rendered.getChannelData(0).slice()
}

function driveOf(track) {
    const points = track.distort && track.distort.points
    if (!points || points.length === 0) return 0
    let sum = 0
    points.forEach((point) => { sum += point.y })
    return sum / points.length
}

async function encodeAac(samples, sampleRate) {
    const Encoder = typeof AudioEncoder === 'function' ? AudioEncoder : null
    if (Encoder == null || typeof AudioData !== 'function') return null
    const frames = []
    let description = null
    let failed = null
    const encoder = new Encoder({
        output: (chunk, meta) => {
            const bytes = new Uint8Array(chunk.byteLength)
            chunk.copyTo(bytes)
            frames.push(bytes)
            if (meta && meta.decoderConfig && meta.decoderConfig.description) description = meta.decoderConfig.description
        },
        error: (err) => { failed = err },
    })
    try {
        encoder.configure({ codec: 'mp4a.40.2', sampleRate, numberOfChannels: 1, bitrate: 128000 })
    } catch (err) {
        try { encoder.close() } catch (closeErr) { /* already closed */ }
        return null
    }
    const block = 4096
    for (let at = 0; at < samples.length; at += block) {
        const slice = samples.subarray(at, Math.min(samples.length, at + block))
        const copy = new Float32Array(slice)
        const data = new AudioData({
            format: 'f32-planar',
            sampleRate,
            numberOfFrames: copy.length,
            numberOfChannels: 1,
            timestamp: Math.round(at * 1000000 / sampleRate),
            data: copy.buffer,
        })
        encoder.encode(data)
        data.close()
    }
    await encoder.flush()
    encoder.close()
    if (failed || frames.length === 0 || description == null) return null
    return buildAacMp4(frames, sampleRate, new Uint8Array(description))
}

async function bounce(song, clips, onProgress, preferWav) {
    const rate = 44100
    const samples = await renderMix(song, clips, rate, onProgress)
    const aac = preferWav ? null : await encodeAac(samples, rate)
    if (aac) {
        if (onProgress) onProgress(1)
        return { bytes: aac, mime: 'audio/mp4', extension: 'm4a', kind: 'aac' }
    }
    if (onProgress) onProgress(1)
    return { bytes: encodeWav(samples, rate), mime: 'audio/wav', extension: 'wav', kind: 'wav' }
}

async function saveBytes(name, bytes, mime) {
    const blob = new Blob([bytes], { type: mime })
    const file = new File([blob], name, { type: mime })
    const native = typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()
    if (native) {
        try {
            const filesystem = await import('@capacitor/filesystem')
            const share = await import('@capacitor/share')
            let binary = ''
            const chunk = 0x8000
            for (let i = 0; i < bytes.length; i += chunk) {
                binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
            }
            const path = name
            await filesystem.Filesystem.writeFile({ path, data: btoa(binary), directory: filesystem.Directory.Cache })
            const uri = await filesystem.Filesystem.getUri({ path, directory: filesystem.Directory.Cache })
            await share.Share.share({ title: name, url: uri.uri, dialogTitle: name })
            return 'Saved and ready to share.'
        } catch (err) { /* the WebView can still try a normal download */ }
    }
    if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: name })
        return 'Shared.'
    }
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = name
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
    return 'Download started.'
}

module.exports = {
    resample,
    encodeWav,
    buildAacMp4,
    renderMix,
    bounce,
    saveBytes,
}
