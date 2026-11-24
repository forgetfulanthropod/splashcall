import { dbFromRms, micAudioConstraints, needsAudioResume } from './capture'
import { barSeconds, loopSeconds, recordDownbeat, scalePitchClasses } from './theory'
import { TUNER_SOURCE } from './workletSource'

export type TuneSettings = {
    root: number
    scale: string
    strength: number
    bypass: boolean
}

export type LoopLength = 1 | 2 | 4 | 8 | 'free'

export type MicLevel = {
    rms: number
    peak: number
    db: number
    clipped: boolean
    hearing: boolean
    ready: boolean
}

export type EngineSnapshot = {
    playing: boolean
    elapsed: number
    recordId: string | null
    phase: 'count-in' | 'recording' | null
    overdub: boolean
    progress: Record<string, number>
}

type TrackNode = {
    gain: GainNode
    source: AudioBufferSourceNode | null
    buffer: AudioBuffer | null
    bars: LoopLength
    freeSeconds: number
}

type Take = {
    id: string
    overdub: boolean
    received: number
    chunks: Float32Array[]
    need: number
    free: boolean
    phase: 'count-in' | 'recording'
    recordAt: number
}

/**
 * One microphone and a buffer per track.
 * Bar loops share a master downbeat. A 1-bar loop repeats four times
 * inside one 4-bar loop. Free loops repeat whatever length was recorded.
 */
export class LoopEngine {
    private ctx: AudioContext | null = null
    private tuner: AudioWorkletNode | null = null
    private processor: ScriptProcessorNode | null = null
    private monitor: GainNode | null = null
    private inputGain: GainNode | null = null
    private inputAnalyser: AnalyserNode | null = null
    private wave = new Float32Array(1024)
    private inputTrim = 1
    private mic: MediaStream | null = null
    private tracks = new Map<string, TrackNode>()
    private playing = false
    private startedAt = 0
    private bpm = 90
    private metronome = false
    private countIn = true
    private recording: Take | null = null
    private levels = new Map<string, number>()
    private nextBeat = 0
    private timer: number | null = null
    private onUpdate: () => void
    private ready: Promise<void> | null = null
    private failed = ''
    private tuned = true

    constructor(onUpdate: () => void) {
        this.onUpdate = onUpdate
    }

    error(): string {
        return this.failed
    }

    tunedLive(): boolean {
        return this.tuned
    }

    /** Call synchronously inside the tap so the audio clock can leave the suspended state. */
    prime(): void {
        const ctx = this.context()
        if (ctx != null && needsAudioResume(ctx.state)) void ctx.resume()
    }

    /** What the microphone is sending, measured before auto-tune. */
    level(): MicLevel {
        const analyser = this.inputAnalyser
        if (analyser == null) {
            return { rms: 0, peak: 0, db: -96, clipped: false, hearing: false, ready: false }
        }
        analyser.getFloatTimeDomainData(this.wave)
        let sum = 0
        let peak = 0
        const step = 2
        for (let i = 0; i < this.wave.length; i += step) {
            const sample = this.wave[i]
            const abs = sample < 0 ? -sample : sample
            if (abs > peak) peak = abs
            sum += sample * sample
        }
        const rms = Math.sqrt(sum / Math.max(1, this.wave.length / step))
        return {
            rms,
            peak,
            db: dbFromRms(rms),
            clipped: peak >= 0.98,
            hearing: rms >= 0.02,
            ready: true,
        }
    }

    waveform(): Float32Array {
        return this.wave
    }

    setInputTrim(value: number): void {
        const next = Math.max(0, Math.min(2, value))
        this.inputTrim = next
        if (this.inputGain != null) this.inputGain.gain.value = next
    }

    private context(): AudioContext | null {
        if (this.ctx != null) return this.ctx
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (Ctx == null) return null
        this.ctx = new Ctx()
        return this.ctx
    }

    async ensure(): Promise<void> {
        if (this.ready != null) return this.ready
        this.ready = this.open()
        try {
            await this.ready
        } catch (err) {
            this.ready = null
            throw err
        }
    }

    private async open(): Promise<void> {
        const ctx = this.context()
        if (ctx == null) {
            this.failed = 'This browser cannot play a loop.'
            throw new Error(this.failed)
        }
        if (needsAudioResume(ctx.state)) await ctx.resume()
        const monitor = ctx.createGain()
        monitor.gain.value = 0
        monitor.connect(ctx.destination)
        this.monitor = monitor
        if (navigator.mediaDevices == null || navigator.mediaDevices.getUserMedia == null) {
            this.failed = 'This browser has no microphone. Open the looper in Chrome or the SplashCall app.'
            throw new Error(this.failed)
        }
        let stream: MediaStream
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: micAudioConstraints(),
                video: false,
            })
        } catch (err) {
            this.failed = 'The microphone is blocked. Allow it to record a loop.'
            throw new Error(this.failed)
        }
        this.mic = stream
        if (needsAudioResume(ctx.state)) await ctx.resume()
        const source = ctx.createMediaStreamSource(stream)
        const inputGain = ctx.createGain()
        inputGain.gain.value = this.inputTrim
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 1024
        analyser.smoothingTimeConstant = 0.35
        source.connect(inputGain)
        inputGain.connect(analyser)
        this.inputGain = inputGain
        this.inputAnalyser = analyser
        const meterKeep = ctx.createGain()
        meterKeep.gain.value = 0.001
        analyser.connect(meterKeep)
        meterKeep.connect(ctx.destination)
        const sink = ctx.createMediaStreamDestination()
        analyser.connect(sink)
        const worklet = (ctx as AudioContext & { audioWorklet?: { addModule: (url: string) => Promise<void> } }).audioWorklet
        if (worklet != null) {
            const url = URL.createObjectURL(new Blob([TUNER_SOURCE], { type: 'application/javascript' }))
            try {
                await worklet.addModule(url)
                const node = new AudioWorkletNode(ctx, 'splash-tuner', {
                    numberOfInputs: 1,
                    numberOfOutputs: 1,
                    outputChannelCount: [2],
                })
                node.port.onmessage = (event: MessageEvent) => {
                    const data = event.data as { type?: string, samples?: Float32Array }
                    if (data.type === 'chunk' && data.samples) this.takeChunk(data.samples)
                }
                analyser.connect(node)
                node.connect(monitor)
                node.connect(sink)
                this.tuner = node
                this.tuned = true
                this.failed = ''
                return
            } catch (err) {
                this.tuned = false
            } finally {
                URL.revokeObjectURL(url)
            }
        }
        this.attachDryCapture(ctx, analyser, monitor, sink)
    }

    private attachDryCapture(ctx: AudioContext, source: AudioNode, monitor: GainNode, sink: MediaStreamAudioDestinationNode): void {
        const factory = (ctx as AudioContext & { createScriptProcessor?: (size: number, inputs: number, outputs: number) => ScriptProcessorNode }).createScriptProcessor
        if (factory == null) {
            this.failed = 'This browser cannot record a loop.'
            throw new Error(this.failed)
        }
        const processor = factory.call(ctx, 2048, 1, 1)
        processor.onaudioprocess = (event: AudioProcessingEvent) => {
            const input = event.inputBuffer.getChannelData(0)
            event.outputBuffer.getChannelData(0).set(input)
            const take = this.recording
            if (take == null || this.ctx == null || this.ctx.currentTime < take.recordAt) return
            take.phase = 'recording'
            this.takeChunk(new Float32Array(input))
        }
        source.connect(processor)
        processor.connect(monitor)
        processor.connect(sink)
        this.processor = processor
        this.tuned = false
        this.failed = 'Auto-tune is off in this browser. The loop is still your voice.'
    }

    snapshot(): EngineSnapshot {
        if (this.recording != null && this.ctx != null && this.ctx.currentTime >= this.recording.recordAt) {
            this.recording.phase = 'recording'
        }
        const elapsed = this.playing && this.ctx != null ? this.ctx.currentTime - this.startedAt : 0
        const progress: Record<string, number> = {}
        this.tracks.forEach((track, id) => {
            const duration = this.durationOf(track)
            progress[id] = elapsed > 0 && duration > 0 ? ((elapsed % duration) + duration) % duration / duration : 0
        })
        return {
            playing: this.playing,
            elapsed,
            recordId: this.recording ? this.recording.id : null,
            phase: this.recording ? this.recording.phase : null,
            overdub: this.recording ? this.recording.overdub : false,
            progress,
        }
    }

    async play(): Promise<void> {
        this.prime()
        const ctx = this.context()
        if (ctx == null) {
            this.failed = 'This browser cannot play a loop.'
            throw new Error(this.failed)
        }
        if (needsAudioResume(ctx.state)) {
            try { await ctx.resume() } catch (err) { /* the next tap will try again */ }
        }
        if (needsAudioResume(ctx.state)) {
            this.failed = 'Tap once more so this phone can play the loop.'
            throw new Error(this.failed)
        }
        this.failed = ''
        if (this.playing) return
        this.startedAt = ctx.currentTime
        this.playing = true
        this.nextBeat = this.startedAt
        this.armScheduler()
        this.tracks.forEach((track) => this.startSource(track, 0, ctx.currentTime))
        this.onUpdate()
    }

    stop(): void {
        this.playing = false
        this.monitorOff()
        this.dropTake()
        this.tracks.forEach((track) => this.stopSource(track))
        if (this.timer != null) {
            window.clearInterval(this.timer)
            this.timer = null
        }
        this.onUpdate()
    }

    setMetronome(on: boolean): void {
        this.metronome = on
        if (on && this.playing) this.armScheduler()
    }

    setCountIn(on: boolean): void {
        this.countIn = on
    }

    setBpm(bpm: number): void {
        const next = Math.max(40, Math.min(200, Math.round(bpm)))
        if (next === this.bpm) return
        this.bpm = next
        this.tracks.forEach((track) => {
            if (track.bars !== 'free') {
                track.buffer = null
                this.stopSource(track)
            }
        })
        if (this.playing && this.ctx != null) {
            this.startedAt = this.ctx.currentTime
            this.nextBeat = this.startedAt
            this.tracks.forEach((track) => this.startSource(track, 0, this.ctx.currentTime))
        }
        this.onUpdate()
    }

    setLength(id: string, bars: LoopLength): void {
        const track = this.tracks.get(id)
        if (track == null) {
            this.rememberLength(id, bars)
            return
        }
        if (track.bars === bars) return
        track.bars = bars
        track.buffer = null
        track.freeSeconds = 0
        this.stopSource(track)
        this.onUpdate()
    }

    private rememberLength(id: string, bars: LoopLength): void {
        this.pendingLength.set(id, bars)
    }

    private pendingLength = new Map<string, LoopLength>()

    setTune(settings: TuneSettings): void {
        if (this.tuner == null) return
        this.tuner.port.postMessage({
            type: 'config',
            strength: settings.bypass ? 0 : settings.strength / 100,
            bypass: settings.bypass || !this.tuned,
            mask: scalePitchClasses(settings.root, settings.scale),
        })
    }

    setGain(id: string, volume: number, muted: boolean): void {
        const level = muted ? 0 : Math.max(0, Math.min(1, volume / 100))
        this.levels.set(id, level)
        const track = this.tracks.get(id)
        if (track != null) track.gain.gain.value = level
    }

    hasAudio(id: string): boolean {
        const track = this.tracks.get(id)
        return track != null && track.buffer != null && rms(track.buffer.getChannelData(0)) >= 0.002
    }

    removeTrack(id: string): void {
        if (this.recording != null && this.recording.id === id) this.dropTake()
        const track = this.tracks.get(id)
        if (track == null) return
        this.stopSource(track)
        track.gain.disconnect()
        this.tracks.delete(id)
    }

    async record(id: string, overdub: boolean, settings: TuneSettings, bars: LoopLength): Promise<void> {
        this.prime()
        await this.ensure()
        const ctx = this.ctx
        if (ctx == null) return
        if (needsAudioResume(ctx.state)) {
            try { await ctx.resume() } catch (err) { /* needs a gesture */ }
        }
        if (needsAudioResume(ctx.state)) {
            this.failed = 'Tap once more so this phone can play the loop.'
            throw new Error(this.failed)
        }
        if (this.recording != null && this.recording.id === id) {
            if (this.recording.free && this.recording.phase === 'recording') this.finish(true)
            else {
                this.dropTake()
                this.onUpdate()
            }
            return
        }
        if (this.recording != null) this.dropTake()
        this.setTune(settings)
        const node = this.track(id)
        if (node == null) return
        node.bars = bars
        const bar = barSeconds(this.bpm)
        const downbeat = recordDownbeat(ctx.currentTime, this.playing, this.startedAt, bar, this.countIn)
        if (!this.playing) {
            this.startedAt = downbeat
            this.playing = true
            this.nextBeat = downbeat
            this.armScheduler()
            this.tracks.forEach((track) => {
                if (track.buffer != null) this.startSource(track, 0, downbeat)
            })
        }
        if (this.countIn) this.scheduleCountIn(downbeat, bar)
        const free = bars === 'free' && !(overdub && node.buffer != null)
        const seconds = free
            ? 0
            : bars === 'free'
                ? node.freeSeconds
                : loopSeconds(this.bpm, bars)
        const need = seconds > 0 ? Math.round(seconds * ctx.sampleRate) : 0
        const delaySamples = Math.max(0, Math.round((downbeat - ctx.currentTime) * ctx.sampleRate))
        this.recording = {
            id,
            overdub,
            received: 0,
            chunks: [],
            need,
            free,
            phase: delaySamples > ctx.sampleRate * 0.03 ? 'count-in' : 'recording',
            recordAt: downbeat,
        }
        if (this.monitor) this.monitor.gain.value = 0.9
        if (this.tuner != null) {
            this.tuner.port.postMessage({ type: 'record', on: true, delaySamples })
        }
        this.onUpdate()
    }

    private scheduleCountIn(downbeat: number, bar: number): void {
        const beat = bar / 4
        for (let i = 0; i < 4; i++) {
            this.clickAt(downbeat - (4 - i) * beat, i === 0)
        }
    }

    private dropTake(): void {
        if (this.tuner != null) this.tuner.port.postMessage({ type: 'record', on: false, delaySamples: 0 })
        this.recording = null
        this.monitorOff()
    }

    private monitorOff(): void {
        if (this.monitor != null) this.monitor.gain.value = 0
    }

    private armScheduler(): void {
        if (this.timer != null) return
        this.timer = window.setInterval(() => this.lookahead(), 25)
    }

    private lookahead(): void {
        const ctx = this.ctx
        if (ctx == null || !this.playing || !this.metronome) return
        const beat = 60 / this.bpm
        const horizon = ctx.currentTime + 0.15
        while (this.nextBeat < horizon) {
            const index = Math.round((this.nextBeat - this.startedAt) / beat)
            this.clickAt(this.nextBeat, ((index % 4) + 4) % 4 === 0)
            this.nextBeat += beat
        }
    }

    private clickAt(time: number, accent: boolean): void {
        const ctx = this.ctx
        if (ctx == null || time < ctx.currentTime - 0.02) return
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.frequency.value = accent ? 1760 : 1174
        osc.connect(gain)
        gain.connect(ctx.destination)
        const start = Math.max(time, ctx.currentTime)
        gain.gain.setValueAtTime(0.0001, start)
        gain.gain.exponentialRampToValueAtTime(accent ? 0.35 : 0.18, start + 0.004)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.05)
        osc.start(start)
        osc.stop(start + 0.06)
    }

    private track(id: string): TrackNode | null {
        const ctx = this.ctx
        if (ctx == null) return null
        const existing = this.tracks.get(id)
        if (existing != null) return existing
        const gain = ctx.createGain()
        gain.connect(ctx.destination)
        const bars = this.pendingLength.get(id) || 4
        this.pendingLength.delete(id)
        gain.gain.value = this.levels.has(id) ? (this.levels.get(id) as number) : 0.8
        const created: TrackNode = { gain, source: null, buffer: null, bars, freeSeconds: 0 }
        this.tracks.set(id, created)
        return created
    }

    private durationOf(track: TrackNode): number {
        if (track.bars === 'free') return track.freeSeconds
        return loopSeconds(this.bpm, track.bars)
    }

    private takeChunk(samples: Float32Array): void {
        const take = this.recording
        const ctx = this.ctx
        if (take == null || ctx == null) return
        if (ctx.currentTime < take.recordAt) return
        take.phase = 'recording'
        const room = take.free ? samples.length : take.need - take.received
        if (!take.free && room <= 0) return
        const slice = !take.free && samples.length > room ? samples.subarray(0, room) : samples
        take.chunks.push(new Float32Array(slice))
        take.received += slice.length
        if (take.free || take.received < take.need) return
        this.finish(false)
    }

    private finish(freeStop: boolean): void {
        const take = this.recording
        const ctx = this.ctx
        if (take == null || ctx == null) return
        if (take.free && !freeStop) return
        if (this.tuner != null) this.tuner.port.postMessage({ type: 'record', on: false, delaySamples: 0 })
        const length = take.free ? take.received : take.need
        this.recording = null
        this.monitorOff()
        if (length < ctx.sampleRate * 0.15) {
            this.failed = 'Hold the recording a little longer.'
            this.onUpdate()
            return
        }
        const fresh = join(take.chunks, length)
        if (rms(fresh) < 0.002) {
            this.failed = 'That take was silent. Allow the microphone and try again.'
            this.onUpdate()
            return
        }
        const track = this.track(take.id)
        if (track == null) return
        const mixed = take.overdub && track.buffer != null ? mix(track.buffer, fresh) : fresh
        const buffer = ctx.createBuffer(1, mixed.length, ctx.sampleRate)
        buffer.getChannelData(0).set(mixed)
        track.buffer = buffer
        if (track.bars === 'free') track.freeSeconds = mixed.length / ctx.sampleRate
        this.failed = this.tuned ? '' : 'Auto-tune is off in this browser. The loop is still your voice.'
        const trackId = take.id
        // Start on the next turn. Doing it inside the worklet message can
        // schedule the take in a render quantum that already passed, so the
        // loop stays silent even though the buffer has the voice in it.
        Promise.resolve().then(() => {
            const live = this.ctx
            const playing = this.tracks.get(trackId)
            if (!this.playing || live == null || playing == null || playing.buffer == null) return
            const duration = playing.buffer.duration
            const elapsed = live.currentTime - this.startedAt
            const offset = ((elapsed % duration) + duration) % duration
            this.startSource(playing, offset, live.currentTime)
            this.onUpdate()
        })
        this.onUpdate()
    }

    private startSource(track: TrackNode, offset: number, when: number): void {
        const ctx = this.ctx
        if (ctx == null || track.buffer == null) return
        this.stopSource(track)
        const source = ctx.createBufferSource()
        source.buffer = track.buffer
        source.loop = true
        source.connect(track.gain)
        const startAt = Math.max(0, Math.min(offset, Math.max(0, track.buffer.duration - 0.001)))
        source.start(when, startAt)
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
        if (this.mic != null) {
            this.mic.getTracks().forEach((track) => track.stop())
            this.mic = null
        }
        if (this.ctx != null) {
            void this.ctx.close()
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

function rms(samples: Float32Array): number {
    if (samples.length === 0) return 0
    let sum = 0
    let count = 0
    for (let i = 0; i < samples.length; i += 8) {
        sum += samples[i] * samples[i]
        count += 1
    }
    return Math.sqrt(sum / Math.max(1, count))
}
