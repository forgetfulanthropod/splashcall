import { dbFromRms, micAudioConstraints, needsAudioResume } from './capture'
import { driveAt, placement, schedulePoints, sectionDrive, shaperSamples, songSeconds } from './song'
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

type DrivePoint = { x: number, y: number }
type SectionDrive = { bar: number, drive: number }

type TrackNode = {
    gain: GainNode
    dry: GainNode
    wet: GainNode
    shaper: WaveShaperNode
    sources: AudioBufferSourceNode[]
    armed: Set<string>
    buffer: AudioBuffer | null
    bars: LoopLength
    freeSeconds: number
    preGapBeats: number
    postGapBeats: number
    preGapMs: number
    postGapMs: number
    startBar: number
    endBar: number
    distortMix: number
    distortPoints: DrivePoint[]
    sections: SectionDrive[]
    lastDrive: number
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
    private micPromise: Promise<MediaStream> | null = null
    private captureMode: 'worklet' | 'script' | 'file' = 'worklet'
    private fileRecorder: MediaRecorder | null = null
    private fileParts: Blob[] = []
    private takeReport: { rms: number, samples: number, via: string } | null = null
    private recordWall = 0
    private tracks = new Map<string, TrackNode>()
    private playing = false
    private startedAt = 0
    private playhead = 0
    private songBars = 32
    private metroVolume = 0.7
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

    /**
     * Start the microphone request in the same turn as the tap.
     * Android Chrome ignores getUserMedia if it is called after an await.
     */
    beginCapture(): void {
        this.prime()
        if (this.mic != null || this.micPromise != null) return
        if (typeof navigator === 'undefined' || navigator.mediaDevices == null || navigator.mediaDevices.getUserMedia == null) {
            this.failed = 'This browser has no microphone. Open the looper in Chrome or the SplashCall app.'
            return
        }
        try {
            this.micPromise = navigator.mediaDevices.getUserMedia({
                audio: micAudioConstraints(),
                video: false,
            })
        } catch (err) {
            this.failed = 'The microphone is blocked. Allow it to record a loop.'
            this.micPromise = null
        }
    }

    lastTake(): { rms: number, samples: number, via: string } | null {
        return this.takeReport
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
        void ctx.resume()
        const monitor = ctx.createGain()
        monitor.gain.value = 0
        monitor.connect(ctx.destination)
        this.monitor = monitor
        if (navigator.mediaDevices == null || navigator.mediaDevices.getUserMedia == null) {
            this.failed = 'This browser has no microphone. Open the looper in Chrome or the SplashCall app.'
            throw new Error(this.failed)
        }
        const pending = this.micPromise
        this.micPromise = null
        let stream: MediaStream
        try {
            stream = pending != null
                ? await pending
                : await navigator.mediaDevices.getUserMedia({
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
        meterKeep.gain.value = 0.02
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
                this.captureMode = 'worklet'
                this.failed = ''
                return
            } catch (err) {
                this.tuned = false
                console.info('looper worklet failed', err instanceof Error ? err.message : err)
            } finally {
                URL.revokeObjectURL(url)
            }
        }
        this.attachDryCapture(ctx, analyser, monitor, sink)
    }

    private attachDryCapture(ctx: AudioContext, source: AudioNode, monitor: GainNode, sink: MediaStreamAudioDestinationNode): void {
        const factory = (ctx as AudioContext & { createScriptProcessor?: (size: number, inputs: number, outputs: number) => ScriptProcessorNode }).createScriptProcessor
        if (factory == null) {
            this.captureMode = 'file'
            this.failed = ''
            return
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
        this.captureMode = 'script'
        this.failed = 'Auto-tune is off in this browser. The loop is still your voice.'
    }

    snapshot(): EngineSnapshot {
        if (this.recording != null && this.ctx != null && this.ctx.currentTime >= this.recording.recordAt) {
            this.recording.phase = 'recording'
            this.startFileRecorder()
        }
        if (this.recording != null && this.recording.received === 0 && this.recordWall > 0 && typeof performance !== 'undefined' && performance.now() - this.recordWall > 8000) {
            this.failed = this.captureMode === 'file'
                ? 'Still waiting on the microphone. Tap Rec again if nothing is saved.'
                : 'No audio arrived from the microphone. Tap Rec again.'
        }
        const elapsed = this.songElapsed()
        const progress: Record<string, number> = {}
        this.tracks.forEach((track, id) => {
            const place = placement(elapsed, this.bpm, this.durationOf(track), track, track.startBar, track.endBar)
            progress[id] = place.sounding ? place.through : 0
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
        this.nextBeat = this.playhead
        this.armScheduler()
        this.materialize()
        this.scheduleAhead(this.playhead)
        this.onUpdate()
    }

    seek(seconds: number): void {
        const end = songSeconds(this.bpm, this.songBars)
        this.playhead = Math.max(0, Math.min(Math.max(0, end - 0.05), seconds))
        if (!this.playing || this.ctx == null) {
            this.onUpdate()
            return
        }
        this.startedAt = this.ctx.currentTime
        this.nextBeat = this.playhead
        this.tracks.forEach((track) => {
            this.stopSources(track)
            track.armed.clear()
        })
        this.scheduleAhead(this.playhead)
        this.onUpdate()
    }

    setSongBars(bars: number): void {
        this.songBars = Math.max(4, Math.min(400, Math.round(bars)))
    }

    setMetronomeVolume(amount: number): void {
        this.metroVolume = Math.max(0, Math.min(1, amount))
    }

    configure(id: string, plan: {
        bars: LoopLength
        preGapBeats: number
        postGapBeats: number
        preGapMs: number
        postGapMs: number
        startBar: number
        endBar: number
        distortMix: number
        distortPoints: DrivePoint[]
        sections: SectionDrive[]
    }): void {
        this.plans.set(id, plan)
        const track = this.tracks.get(id)
        if (track != null) this.applyPlan(track, plan)
    }

    private plans = new Map<string, {
        bars: LoopLength
        preGapBeats: number
        postGapBeats: number
        preGapMs: number
        postGapMs: number
        startBar: number
        endBar: number
        distortMix: number
        distortPoints: DrivePoint[]
        sections: SectionDrive[]
    }>()

    private applyPlan(track: TrackNode, plan: {
        bars: LoopLength
        preGapBeats: number
        postGapBeats: number
        preGapMs: number
        postGapMs: number
        startBar: number
        endBar: number
        distortMix: number
        distortPoints: DrivePoint[]
        sections: SectionDrive[]
    }): void {
        track.bars = plan.bars
        track.preGapBeats = plan.preGapBeats
        track.postGapBeats = plan.postGapBeats
        track.preGapMs = plan.preGapMs
        track.postGapMs = plan.postGapMs
        track.startBar = plan.startBar
        track.endBar = plan.endBar
        track.distortMix = plan.distortMix
        track.distortPoints = plan.distortPoints
        track.sections = plan.sections
        track.dry.gain.value = 1 - plan.distortMix
        track.wet.gain.value = plan.distortMix
    }

    stop(): void {
        this.playhead = this.songElapsed()
        this.playing = false
        this.monitorOff()
        this.dropTake()
        this.tracks.forEach((track) => this.stopSources(track))
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
                this.stopSources(track)
                track.armed.clear()
            }
        })
        if (this.playing && this.ctx != null) {
            this.startedAt = this.ctx.currentTime
            this.nextBeat = this.playhead
            this.tracks.forEach((track) => {
                this.stopSources(track)
                track.armed.clear()
            })
            this.scheduleAhead(this.playhead)
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
        this.stopSources(track)
        track.armed.clear()
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
        this.stopSources(track)
        track.gain.disconnect()
        this.tracks.delete(id)
    }

    async record(id: string, overdub: boolean, settings: TuneSettings, bars: LoopLength): Promise<void> {
        this.beginCapture()
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
            this.playhead = 0
            this.startedAt = ctx.currentTime
            this.playing = true
            this.nextBeat = 0
            this.armScheduler()
            this.materialize()
            this.scheduleAhead(0)
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
        this.recordWall = typeof performance !== 'undefined' ? performance.now() : 0
        if (this.monitor) this.monitor.gain.value = 0.9
        if (this.tuner != null && this.captureMode === 'worklet') {
            this.tuner.port.postMessage({ type: 'record', on: true, delaySamples })
        }
        if (this.recording.phase === 'recording' || this.captureMode === 'file') this.startFileRecorder()
        if (!free && seconds > 0) {
            const waitMs = Math.max(500, ((downbeat - ctx.currentTime) + seconds + 0.35) * 1000)
            const takeId = id
            window.setTimeout(() => {
                if (this.recording != null && this.recording.id === takeId) this.finish(false)
            }, waitMs)
        }
        this.onUpdate()
    }

    private startFileRecorder(): void {
        if (this.fileRecorder != null || this.mic == null || typeof MediaRecorder === 'undefined') return
        let recorder: MediaRecorder
        try {
            recorder = new MediaRecorder(this.mic)
        } catch (err) {
            this.failed = 'This browser could not open a recorder.'
            return
        }
        this.fileParts = []
        recorder.ondataavailable = (event: BlobEvent) => {
            if (event.data != null && event.data.size > 0) this.fileParts.push(event.data)
        }
        try {
            recorder.start(250)
        } catch (err) {
            this.failed = 'This browser could not start the recorder.'
            return
        }
        this.fileRecorder = recorder
    }

    private discardFile(): void {
        const recorder = this.fileRecorder
        this.fileRecorder = null
        this.fileParts = []
        if (recorder != null && recorder.state !== 'inactive') {
            try { recorder.stop() } catch (err) { /* already stopped */ }
        }
    }

    private stopFileRecorder(): Promise<Float32Array | null> {
        const recorder = this.fileRecorder
        const ctx = this.ctx
        this.fileRecorder = null
        if (recorder == null || ctx == null) return Promise.resolve(null)
        const parts = this.fileParts
        return new Promise((resolve) => {
            let settled = false
            const done = (samples: Float32Array | null) => {
                if (settled) return
                settled = true
                resolve(samples)
            }
            const timer = window.setTimeout(() => done(null), 1500)
            recorder.onstop = () => {
                window.clearTimeout(timer)
                const blob = new Blob(parts, { type: recorder.mimeType || 'audio/webm' })
                blob.arrayBuffer().then((bytes) => ctx.decodeAudioData(bytes.slice(0))).then((audio) => {
                    done(audio.getChannelData(0).slice())
                }).catch(() => done(null))
            }
            if (recorder.state === 'inactive') {
                window.clearTimeout(timer)
                done(null)
                return
            }
            try { recorder.stop() } catch (err) {
                window.clearTimeout(timer)
                done(null)
            }
        })
    }

    private scheduleCountIn(downbeat: number, bar: number): void {
        const beat = bar / 4
        for (let i = 0; i < 4; i++) {
            this.clickAt(downbeat - (4 - i) * beat, i === 0)
        }
    }

    private dropTake(): void {
        if (this.tuner != null) this.tuner.port.postMessage({ type: 'record', on: false, delaySamples: 0 })
        if (this.fileRecorder != null && this.fileRecorder.state !== 'inactive') {
            try { this.fileRecorder.stop() } catch (err) { /* already stopped */ }
        }
        this.fileRecorder = null
        this.fileParts = []
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
        if (ctx == null || !this.playing) return
        const songNow = this.songElapsed()
        if (songNow >= songSeconds(this.bpm, this.songBars)) {
            this.stop()
            this.playhead = 0
            return
        }
        this.scheduleAhead(songNow)
        this.shapeNow(songNow)
        if (!this.metronome) return
        const beat = 60 / this.bpm
        const horizon = songNow + 0.2
        while (this.nextBeat < horizon) {
            const when = ctx.currentTime + (this.nextBeat - songNow)
            const index = Math.round(this.nextBeat / beat)
            this.clickAt(when, ((index % 4) + 4) % 4 === 0)
            this.nextBeat += beat
        }
    }

    private materialize(): void {
        const ids = new Set<string>()
        this.plans.forEach((_plan, id) => ids.add(id))
        this.pendingAudio.forEach((_clip, id) => ids.add(id))
        ids.forEach((id) => { this.track(id) })
    }

    private songElapsed(): number {
        if (!this.playing || this.ctx == null) return this.playhead
        return Math.max(0, this.playhead + (this.ctx.currentTime - this.startedAt))
    }

    private scheduleAhead(songNow: number): void {
        const ctx = this.ctx
        if (ctx == null) return
        const horizon = songNow + 0.7
        this.tracks.forEach((track) => {
            if (track.buffer == null) return
            const points = schedulePoints(songNow - 0.02, horizon, this.bpm, this.durationOf(track), track, track.startBar, Math.min(track.endBar, this.songBars))
            points.forEach((point) => {
                if (!(point.duration > 0.02)) return
                const key = point.songTime.toFixed(3)
                if (track.armed.has(key)) return
                const when = ctx.currentTime + (point.songTime - songNow)
                if (when < ctx.currentTime - 0.05) return
                track.armed.add(key)
                this.fire(track, when, point.offset, point.duration)
            })
        })
    }

    private shapeNow(songNow: number): void {
        this.tracks.forEach((track) => {
            const place = placement(songNow, this.bpm, this.durationOf(track), track, track.startBar, track.endBar)
            const drive = sectionDrive(place.bar, track.sections, driveAt(place.through, track.distortPoints))
            if (Math.abs(drive - track.lastDrive) > 0.04) {
                track.shaper.curve = Float32Array.from(shaperSamples(drive))
                track.lastDrive = drive
            }
        })
    }

    private fire(track: TrackNode, when: number, offset: number, duration: number): void {
        const ctx = this.ctx
        if (ctx == null || track.buffer == null) return
        const source = ctx.createBufferSource()
        source.buffer = track.buffer
        source.connect(track.dry)
        source.connect(track.shaper)
        const startAt = Math.max(0, Math.min(offset, Math.max(0, track.buffer.duration - 0.001)))
        source.start(Math.max(when, ctx.currentTime), startAt, duration)
        track.sources.push(source)
        source.onended = () => {
            track.sources = track.sources.filter((item) => item !== source)
        }
    }

    private clickAt(time: number, accent: boolean): void {
        const ctx = this.ctx
        if (ctx == null || time < ctx.currentTime - 0.02 || this.metroVolume <= 0.001) return
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.frequency.value = accent ? 1760 : 1174
        osc.connect(gain)
        gain.connect(ctx.destination)
        const start = Math.max(time, ctx.currentTime)
        gain.gain.setValueAtTime(0.0001, start)
        const level = this.metroVolume
        gain.gain.exponentialRampToValueAtTime((accent ? 0.35 : 0.18) * level, start + 0.004)
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
        const dry = ctx.createGain()
        const wet = ctx.createGain()
        const shaper = ctx.createWaveShaper()
        shaper.curve = Float32Array.from(shaperSamples(0))
        dry.connect(gain)
        shaper.connect(wet)
        wet.connect(gain)
        gain.connect(ctx.destination)
        dry.gain.value = 1
        wet.gain.value = 0
        const bars = this.pendingLength.get(id) || 4
        this.pendingLength.delete(id)
        gain.gain.value = this.levels.has(id) ? (this.levels.get(id) as number) : 0.8
        const created: TrackNode = {
            gain, dry, wet, shaper,
            sources: [],
            armed: new Set<string>(),
            buffer: null,
            bars,
            freeSeconds: 0,
            preGapBeats: 0,
            postGapBeats: 0,
            preGapMs: 0,
            postGapMs: 0,
            startBar: 0,
            endBar: this.songBars,
            distortMix: 0,
            distortPoints: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
            sections: [],
            lastDrive: 0,
        }
        const plan = this.plans.get(id)
        if (plan != null) this.applyPlan(created, plan)
        const pending = this.pendingAudio.get(id)
        if (pending != null) {
            created.buffer = this.bufferFrom(pending.samples, pending.rate)
            if (created.bars === 'free') created.freeSeconds = created.buffer.duration
            this.pendingAudio.delete(id)
        }
        this.tracks.set(id, created)
        return created
    }

    private pendingAudio = new Map<string, { samples: Float32Array, rate: number }>()

    private bufferFrom(samples: Float32Array, rate: number): AudioBuffer {
        const ctx = this.ctx
        if (ctx == null) throw new Error('No audio clock')
        const shaped = rate === ctx.sampleRate ? samples : resampleLinear(samples, rate, ctx.sampleRate)
        const buffer = ctx.createBuffer(1, shaped.length, ctx.sampleRate)
        buffer.getChannelData(0).set(shaped)
        return buffer
    }

    copySamples(id: string): { samples: Float32Array, rate: number } | null {
        const pending = this.pendingAudio.get(id)
        if (pending != null) return { samples: pending.samples.slice(), rate: pending.rate }
        const track = this.tracks.get(id)
        const ctx = this.ctx
        if (track == null || track.buffer == null || ctx == null) return null
        return { samples: Float32Array.from(track.buffer.getChannelData(0)), rate: ctx.sampleRate }
    }

    loadSamples(id: string, samples: Float32Array, rate: number): void {
        this.pendingAudio.set(id, { samples, rate })
        const track = this.tracks.get(id)
        if (track == null || this.ctx == null) return
        track.buffer = this.bufferFrom(samples, rate)
        if (track.bars === 'free') track.freeSeconds = track.buffer.duration
        this.pendingAudio.delete(id)
    }

    retainTracks(ids: string[]): void {
        Array.from(this.tracks.keys()).forEach((id) => {
            if (ids.indexOf(id) < 0) this.removeTrack(id)
        })
    }

    clearSongAudio(): void {
        this.stop()
        this.pendingAudio.clear()
        this.tracks.forEach((track) => {
            this.stopSources(track)
            track.buffer = null
            track.freeSeconds = 0
        })
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

    private finishing = false

    private finish(freeStop: boolean): void {
        const take = this.recording
        const ctx = this.ctx
        if (take == null || ctx == null || this.finishing) return
        if (take.free && !freeStop) return
        this.finishing = true
        if (this.tuner != null) this.tuner.port.postMessage({ type: 'record', on: false, delaySamples: 0 })
        this.recording = null
        this.monitorOff()
        const graph = take.received > 0 ? join(take.chunks, take.received) : new Float32Array(0)
        if (rms(graph) >= 0.002) {
            this.discardFile()
            this.finishing = false
            const level = rms(graph)
            console.info('looper take', this.captureMode, 'rms', level.toFixed(4), 'samples', graph.length)
            this.takeReport = { rms: level, samples: graph.length, via: this.captureMode }
            this.commitTake(take, graph, ctx)
            return
        }
        void this.stopFileRecorder().then((fileSamples) => {
            this.finishing = false
            let chosen = graph
            let via = this.captureMode
            if (rms(graph) < 0.002 && fileSamples != null && rms(fileSamples) >= 0.002) {
                chosen = fileSamples
                via = 'file'
            }
            const level = rms(chosen)
            console.info('looper take', via, 'rms', level.toFixed(4), 'samples', chosen.length)
            this.takeReport = { rms: level, samples: chosen.length, via }
            if (chosen.length < ctx.sampleRate * 0.15) {
                this.failed = 'Hold the recording a little longer.'
                this.onUpdate()
                return
            }
            if (level < 0.002) {
                this.failed = 'That take was silent. Allow the microphone and try again.'
                this.onUpdate()
                return
            }
            this.commitTake(take, chosen, ctx)
        }).catch(() => {
            this.finishing = false
            this.failed = 'The recording could not be saved.'
            this.onUpdate()
        })
    }

    private commitTake(take: Take, chosen: Float32Array, ctx: AudioContext): void {
        const track = this.track(take.id)
        if (track == null) return
        const mixed = take.overdub && track.buffer != null ? mix(track.buffer, chosen) : chosen
        const buffer = ctx.createBuffer(1, mixed.length, ctx.sampleRate)
        buffer.getChannelData(0).set(mixed)
        track.buffer = buffer
        if (track.bars === 'free' || take.free) track.freeSeconds = mixed.length / ctx.sampleRate
        this.failed = ''
        this.stopSources(track)
        track.armed.clear()
        const trackId = take.id
        Promise.resolve().then(() => {
            const playing = this.tracks.get(trackId)
            if (!this.playing || playing == null || playing.buffer == null) return
            this.scheduleAhead(this.songElapsed())
            this.onUpdate()
        })
        this.onUpdate()
    }

    private stopSources(track: TrackNode): void {
        track.sources.forEach((source) => {
            try { source.stop() } catch (err) { /* already stopped */ }
            try { source.disconnect() } catch (err) { /* already disconnected */ }
        })
        track.sources = []
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

function resampleLinear(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
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
