import { loopSeconds, scalePitchClasses } from './theory'
import { TUNER_SOURCE } from './workletSource'

export type TuneSettings = {
    root: number
    scale: string
    strength: number
    bypass: boolean
}

type TrackNode = {
    gain: GainNode
    source: AudioBufferSourceNode | null
    buffer: AudioBuffer | null
}

/**
 * One microphone, one tuner, and a buffer per track.
 * Recording is sample-counted so a take is exactly one loop.
 */
export class LoopEngine {
    private ctx: AudioContext | null = null
    private tuner: AudioWorkletNode | null = null
    private monitor: GainNode | null = null
    private mic: MediaStream | null = null
    private tracks = new Map<string, TrackNode>()
    private playing = false
    private startedAt = 0
    private bpm = 96
    private bars = 8
    private recording: { id: string, overdub: boolean, received: number, skip: number, chunks: Float32Array[] } | null = null
    private onUpdate: () => void
    private ready: Promise<void> | null = null
    private failed = ''

    constructor(onUpdate: () => void) {
        this.onUpdate = onUpdate
    }

    error(): string {
        return this.failed
    }

    async ensure(): Promise<void> {
        if (this.ready != null) return this.ready
        this.ready = this.open()
        return this.ready
    }

    private async open(): Promise<void> {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (Ctx == null) {
            this.failed = 'This browser cannot play a loop.'
            throw new Error(this.failed)
        }
        const ctx = new Ctx()
        this.ctx = ctx
        const monitor = ctx.createGain()
        monitor.gain.value = 0
        monitor.connect(ctx.destination)
        this.monitor = monitor
        let stream: MediaStream
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
                video: false,
            })
        } catch (err) {
            this.failed = 'The microphone is blocked. Allow it to record a loop.'
            throw new Error(this.failed)
        }
        this.mic = stream
        const worklet = (ctx as AudioContext & { audioWorklet?: { addModule: (url: string) => Promise<void> } }).audioWorklet
        if (worklet == null) {
            this.failed = 'Auto-tune needs a newer browser. Recording still works without it.'
            throw new Error(this.failed)
        }
        const url = URL.createObjectURL(new Blob([TUNER_SOURCE], { type: 'application/javascript' }))
        try {
            await worklet.addModule(url)
        } finally {
            URL.revokeObjectURL(url)
        }
        const node = new AudioWorkletNode(ctx, 'splash-tuner')
        node.port.onmessage = (event: MessageEvent) => {
            const data = event.data as { type?: string, samples?: Float32Array }
            if (data.type === 'chunk' && data.samples) this.takeChunk(data.samples)
        }
        const source = ctx.createMediaStreamSource(stream)
        source.connect(node)
        node.connect(monitor)
        this.tuner = node
        this.failed = ''
    }

    private loopLength(): number {
        return loopSeconds(this.bpm, this.bars)
    }

    position(): { bar: number, left: number, progress: number, playing: boolean, recordId: string | null, overdub: boolean } {
        const length = this.loopLength()
        const overdub = this.recording ? this.recording.overdub : false
        if (!this.playing || this.ctx == null) {
            return { bar: 1, left: length, progress: 0, playing: false, recordId: this.recording ? this.recording.id : null, overdub }
        }
        const elapsed = this.ctx.currentTime - this.startedAt
        const wrapped = ((elapsed % length) + length) % length
        return {
            bar: (wrapped / length) * this.bars + 1,
            left: length - wrapped,
            progress: wrapped / length,
            playing: true,
            recordId: this.recording ? this.recording.id : null,
            overdub,
        }
    }

    async play(): Promise<void> {
        await this.ensure()
        const ctx = this.ctx
        if (ctx == null) return
        if (ctx.state === 'suspended') await ctx.resume()
        if (this.playing) return
        this.startedAt = ctx.currentTime
        this.playing = true
        this.tracks.forEach((track) => this.startSource(track, 0))
        this.onUpdate()
    }

    stop(): void {
        this.playing = false
        this.monitorOff()
        this.cancelRecord()
        this.tracks.forEach((track) => this.stopSource(track))
        this.onUpdate()
    }

    setTempo(bpm: number, bars: number): void {
        const nextBpm = Math.max(40, Math.min(200, Math.round(bpm)))
        const nextBars = Math.max(1, Math.min(16, Math.round(bars)))
        if (nextBpm === this.bpm && nextBars === this.bars) return
        this.stop()
        this.bpm = nextBpm
        this.bars = nextBars
        this.tracks.forEach((track) => {
            track.buffer = null
        })
        this.onUpdate()
    }

    setTune(settings: TuneSettings): void {
        if (this.tuner == null) return
        this.tuner.port.postMessage({
            type: 'config',
            strength: settings.bypass ? 0 : settings.strength / 100,
            bypass: settings.bypass,
            mask: scalePitchClasses(settings.root, settings.scale),
        })
    }

    setGain(id: string, volume: number, muted: boolean): void {
        const track = this.track(id)
        if (track == null) return
        const level = muted ? 0 : Math.max(0, Math.min(1, volume / 100))
        track.gain.gain.value = level
    }

    hasAudio(id: string): boolean {
        const track = this.tracks.get(id)
        return track != null && track.buffer != null
    }

    removeTrack(id: string): void {
        if (this.recording && this.recording.id === id) this.cancelRecord()
        const track = this.tracks.get(id)
        if (track == null) return
        this.stopSource(track)
        track.gain.disconnect()
        this.tracks.delete(id)
    }

    async record(id: string, overdub: boolean, settings: TuneSettings): Promise<void> {
        await this.ensure()
        const ctx = this.ctx
        if (ctx == null || this.tuner == null) return
        if (ctx.state === 'suspended') await ctx.resume()
        if (this.recording != null) this.cancelRecord()
        this.setTune(settings)
        if (!this.playing) await this.play()
        let skip = 0
        if (this.playing) {
            const into = (ctx.currentTime - this.startedAt) % this.loopLength()
            const remain = this.loopLength() - into
            if (remain > 0.05 && into > 0.05) skip = Math.round(remain * ctx.sampleRate)
        }
        this.recording = { id, overdub, received: 0, skip, chunks: [] }
        if (this.monitor) this.monitor.gain.value = 0.9
        this.tuner.port.postMessage({ type: 'record', on: true })
        this.onUpdate()
    }

    cancelRecord(): void {
        if (this.tuner) this.tuner.port.postMessage({ type: 'record', on: false })
        this.recording = null
        this.monitorOff()
    }

    private monitorOff(): void {
        if (this.monitor) this.monitor.gain.value = 0
    }

    private track(id: string): TrackNode | null {
        const ctx = this.ctx
        if (ctx == null) return null
        const existing = this.tracks.get(id)
        if (existing) return existing
        const gain = ctx.createGain()
        gain.connect(ctx.destination)
        const created = { gain, source: null, buffer: null }
        this.tracks.set(id, created)
        return created
    }

    private takeChunk(samples: Float32Array): void {
        const take = this.recording
        const ctx = this.ctx
        if (take == null || ctx == null) return
        let incoming = samples
        if (take.skip > 0) {
            if (incoming.length <= take.skip) {
                take.skip -= incoming.length
                return
            }
            incoming = incoming.subarray(take.skip)
            take.skip = 0
        }
        const need = Math.round(this.loopLength() * ctx.sampleRate)
        const room = need - take.received
        if (room <= 0) return
        const slice = incoming.length > room ? incoming.subarray(0, room) : incoming
        take.chunks.push(new Float32Array(slice))
        take.received += slice.length
        if (take.received < need) return
        if (this.tuner) this.tuner.port.postMessage({ type: 'record', on: false })
        const fresh = join(take.chunks, need)
        const track = this.track(take.id)
        this.recording = null
        this.monitorOff()
        if (track == null) return
        const mixed = take.overdub && track.buffer ? mix(track.buffer, fresh) : fresh
        const buffer = ctx.createBuffer(1, mixed.length, ctx.sampleRate)
        buffer.copyToChannel(mixed, 0)
        track.buffer = buffer
        if (this.playing) {
            const offset = (ctx.currentTime - this.startedAt) % this.loopLength()
            this.startSource(track, offset)
        }
        this.onUpdate()
    }

    private startSource(track: TrackNode, offset: number): void {
        const ctx = this.ctx
        if (ctx == null || track.buffer == null) return
        this.stopSource(track)
        const source = ctx.createBufferSource()
        source.buffer = track.buffer
        source.loop = true
        source.connect(track.gain)
        const startAt = Math.max(0, Math.min(offset, track.buffer.duration - 0.001))
        source.start(ctx.currentTime, startAt)
        track.source = source
    }

    private stopSource(track: TrackNode): void {
        if (track.source == null) return
        try { track.source.stop() } catch (err) { /* already stopped */ }
        track.source.disconnect()
        track.source = null
    }

    dispose(): void {
        this.stop()
        if (this.mic) {
            this.mic.getTracks().forEach((track) => track.stop())
            this.mic = null
        }
        if (this.ctx) {
            this.ctx.close()
            this.ctx = null
        }
    }
}

function join(chunks: Float32Array[], length: number): Float32Array {
    const out = new Float32Array(length)
    let at = 0
    for (let i = 0; i < chunks.length && at < length; i++) {
        const chunk = chunks[i]
        const n = Math.min(chunk.length, length - at)
        out.set(chunk.subarray(0, n), at)
        at += n
    }
    return out
}

function mix(existing: AudioBuffer, incoming: Float32Array): Float32Array {
    const old = existing.getChannelData(0)
    const out = new Float32Array(incoming.length)
    let peak = 1
    for (let i = 0; i < incoming.length; i++) {
        const sample = (i < old.length ? old[i] : 0) + incoming[i]
        out[i] = sample
        const abs = sample < 0 ? -sample : sample
        if (abs > peak) peak = abs
    }
    if (peak > 1) {
        for (let i = 0; i < out.length; i++) out[i] /= peak
    }
    return out
}
