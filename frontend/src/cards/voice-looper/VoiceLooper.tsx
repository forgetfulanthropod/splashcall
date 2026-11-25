import React, { useEffect, useRef, useState } from 'react'
import styled, { keyframes } from 'styled-components'
import { useAppContext } from '../../context'
import { clearDataEvent, emitDataEvent, onDataEvent } from '../../connection/dataConn'
import { bounce, saveBytes } from './exportMix'
import { EngineSnapshot, LoopEngine, LoopLength, MicLevel, TuneSettings } from './engine'
import PlaySheet, { SheetTab } from './PlaySheet'
import { chordAt, defaultSong, defaultTrack, freshLibrary, hashSamples, Library, parseProgression, pushRevision, restoreRevision, Song, SongTrack } from './song'
import { centsBetween, estimatePitch, listenPlan, listenToVocal, localWand, renderPart } from './wand'
import { drawWaveform, testVoice, waveformHasEnergy } from './waveform'
import { keepAwake, readLibrary, recallAudio, rememberAudio, retainAudio, writeLibrary } from './store'
import { barSeconds, keyLabel, NOTES, ScaleName } from './theory'
import { clampVolume, meterScale, pieWedge, volumeFromGesture } from './pie'

const SCALES: ScaleName[] = ['Major', 'Minor', 'Dorian', 'Mixolydian', 'Pentatonic']
const LENGTHS: LoopLength[] = [1, 2, 4, 8, 'free']

type Track = SongTrack

type TestLine = { name: string, pass: boolean, detail: string }

function tuneOf(track: Track): TuneSettings {
    return { root: track.root, scale: track.scale, strength: track.strength, bypass: track.bypass }
}

export default function VoiceLooper(): JSX.Element {
    const { otherName } = useAppContext()
    const [library, setLibrary] = useState<Library>(() => readLibrary() || freshLibrary())
    const song = library.songs.find((item) => item.id === library.activeId) || library.songs[0]
    const tracks = song.tracks
    const bpm = song.bpm
    const metronome = song.metronome
    const countIn = song.countIn
    const [clock, setClock] = useState<EngineSnapshot>({ playing: false, elapsed: 0, recordId: null, phase: null, overdub: false, progress: {} })
    const [audio, setAudio] = useState<Record<string, boolean>>({})
    const [sheetId, setSheetId] = useState<string | null>(null)
    const [editing, setEditing] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [level, setLevel] = useState<MicLevel>({ rms: 0, peak: 0, db: -96, clipped: false, hearing: false, ready: false })
    const [sheetOpen, setSheetOpen] = useState(false)
    const [tab, setTab] = useState<SheetTab>('Song')
    const [note, setNote] = useState('')
    const [takeLine, setTakeLine] = useState('')
    const [waves, setWaves] = useState<Record<string, Float32Array>>({})
    const [results, setResults] = useState<TestLine[]>([])
    const [testing, setTesting] = useState(false)
    const [listening, setListening] = useState(false)
    const wandTap = useRef(0)
    const inputTrim = song.inputTrim
    const waveRef = useRef<HTMLCanvasElement | null>(null)
    const engineRef = useRef<LoopEngine | null>(null)
    const tracksRef = useRef(tracks)
    const suppress = useRef(false)
    const selfId = useRef(Math.random().toString(36).slice(2, 10))
    tracksRef.current = tracks
    const songRef = useRef(song)
    songRef.current = song
    const savedAudio = useRef<Record<string, string>>({})

    function updateActive(recipe: (current: Song) => Song): void {
        setLibrary((current) => ({
            ...current,
            songs: current.songs.map((item) => item.id === current.activeId ? { ...recipe(item), updated: Date.now() } : item),
        }))
    }

    function setTracks(update: (current: Track[]) => Track[]): void {
        updateActive((current) => ({ ...current, tracks: update(current.tracks) }))
    }

    function setBpm(next: number): void {
        updateActive((current) => ({ ...current, bpm: next }))
    }

    function setMetronome(next: boolean): void {
        updateActive((current) => ({ ...current, metronome: next }))
    }

    function setCountIn(next: boolean): void {
        updateActive((current) => ({ ...current, countIn: next }))
    }

    function setInputTrim(next: number): void {
        updateActive((current) => ({ ...current, inputTrim: next }))
    }

    function engine(): LoopEngine {
        if (engineRef.current == null) {
            engineRef.current = new LoopEngine(() => {
                const current = engineRef.current
                if (current == null) return
                const flags: Record<string, boolean> = {}
                tracksRef.current.forEach((track) => {
                    flags[track.id] = current.hasAudio(track.id)
                    if (!flags[track.id]) return
                    const clip = current.copySamples(track.id)
                    if (clip == null) return
                    const stamp = hashSamples(clip.samples) + 'r' + clip.rate
                    if (savedAudio.current[track.id] === stamp) return
                    savedAudio.current[track.id] = stamp
                    setWaves((prev) => ({ ...prev, [track.id]: current.peaks(track.id, 96) }))
                    rememberAudio(clip.samples, clip.rate).then((id) => {
                        updateActive((currentSong) => ({
                            ...currentSong,
                            revisions: pushRevision(currentSong, 'Recorded ' + track.name, Date.now()),
                            tracks: currentSong.tracks.map((item) => item.id === track.id ? { ...item, audioId: id } : item),
                        }))
                    }).catch(() => { setError('This phone is full. Delete an old revision or song.') })
                })
                setAudio(flags)
                setClock(current.snapshot())
                const report = current.lastTake()
                if (report != null && report.rms >= 0.002) {
                    setTakeLine('Saved ' + report.via + ' take · RMS ' + report.rms.toFixed(3))
                }
                const message = current.error()
                if (message.length > 0) setError(message)
            })
        }
        return engineRef.current
    }

    useEffect(() => {
        const loop = engine()
        let frame = 0
        let last = ''
        let levelAt = 0
        const tick = (now: number): void => {
            const pos = loop.snapshot()
            const key = (pos.playing ? '1' : '0') + '|' + (pos.recordId || '') + '|' + (pos.phase || '') + '|' + pos.elapsed.toFixed(1)
            if (key !== last) {
                last = key
                setClock(pos)
            }
            const heard = loop.level()
            const playing = loop.outputLevel()
            if (now - levelAt > 70) {
                levelAt = now
                setLevel({
                    ...heard,
                    rms: Math.max(heard.rms, playing.rms),
                    peak: Math.max(heard.peak, playing.peak),
                })
            }
            const canvas = waveRef.current
            if (canvas != null) drawWave(canvas, loop.waveform())
            const current = songRef.current
            if (current.followChords && pos.playing) {
                const chord = chordAt(pos.elapsed, current.bpm, current.chords, current.barsEach)
                if (chord != null) {
                    const recording = current.tracks.find((item) => item.id === pos.recordId)
                    const target = recording || current.tracks[0]
                    if (target != null && !target.bypass) {
                        loop.setTune({ root: chord.root, scale: chord.scale, strength: target.strength, bypass: false })
                    }
                }
            }
            frame = requestAnimationFrame(tick)
        }
        frame = requestAnimationFrame(tick)
        return () => {
            cancelAnimationFrame(frame)
            loop.dispose()
            engineRef.current = null
        }
    }, [])

    useEffect(() => {
        onDataEvent('VoiceLooper-state', (incoming) => {
            const data = incoming as { from?: string, tracks?: Track[] }
            if (data == null || data.from === selfId.current || !Array.isArray(data.tracks)) return
            suppress.current = true
            setTracks((current) => {
                const extras = data.tracks.filter((remote) => !current.some((track) => track.id === remote.id))
                const merged = current.map((track) => {
                    const remote = data.tracks.find((item) => item.id === track.id)
                    if (remote == null) return track
                    return {
                        ...track,
                        name: typeof remote.name === 'string' ? remote.name.slice(0, 24) : track.name,
                        root: clampIndex(remote.root),
                        scale: isScale(remote.scale) ? remote.scale : track.scale,
                        strength: clampPercent(remote.strength, track.strength),
                        bypass: Boolean(remote.bypass),
                        volume: clampPercent(remote.volume, track.volume),
                        muted: Boolean(remote.muted),
                        bars: isLength(remote.bars) ? remote.bars : track.bars,
                    }
                })
                return merged.concat(extras.map(cleanRemote))
            })
        })
        return () => clearDataEvent('VoiceLooper-state')
    }, [])

    useEffect(() => {
        if (suppress.current) {
            suppress.current = false
            return
        }
        emitDataEvent('VoiceLooper-state', {
            from: selfId.current,
            tracks: tracks.map((track) => ({
                id: track.id,
                name: track.name,
                root: track.root,
                scale: track.scale,
                strength: track.strength,
                bypass: track.bypass,
                volume: track.volume,
                muted: track.muted,
                bars: track.bars,
            })),
        })
        tracks.forEach((track) => engine().setGain(track.id, track.volume, track.muted))
    }, [tracks])

    useEffect(() => {
        const eng = engine()
        eng.retainTracks(song.tracks.map((track) => track.id))
        eng.setSongBars(song.songBars)
        eng.setBpm(song.bpm)
        eng.setMetronome(song.metronome)
        eng.setMetronomeVolume(song.metronomeVolume / 100)
        eng.setCountIn(song.countIn)
        eng.setInputTrim(song.inputTrim / 100)
        song.tracks.forEach((track) => {
            eng.configure(track.id, {
                bars: track.bars,
                preGapBeats: track.preGapBeats,
                postGapBeats: track.postGapBeats,
                preGapMs: track.preGapMs,
                postGapMs: track.postGapMs,
                startBar: track.startBar,
                endBar: Math.min(track.endBar, song.songBars),
                distortMix: track.distort.mix,
                distortPoints: track.distort.points,
                sections: track.distort.sections,
            })
        })
    }, [song])

    useEffect(() => { void keepAwake() }, [])

    const audioKey = song.id + '|' + song.tracks.map((track) => track.audioId).join(',')
    useEffect(() => {
        let cancel = false
        songRef.current.tracks.forEach((track) => {
            if (track.audioId === '' || savedAudio.current[track.id] === track.audioId) return
            recallAudio(track.audioId).then((clip) => {
                if (cancel || clip == null) return
                savedAudio.current[track.id] = track.audioId
                const eng = engine()
                eng.loadSamples(track.id, clip.samples, clip.rate)
                setWaves((prev) => ({ ...prev, [track.id]: eng.peaks(track.id, 96) }))
            }).catch(() => { /* a missing take stays empty */ })
        })
        return () => { cancel = true }
    }, [audioKey])

    const arrangeStamp = JSON.stringify(song.tracks.map((track) => [track.startBar, track.endBar, track.preGapBeats, track.postGapBeats, track.preGapMs, track.postGapMs, track.distort])) + JSON.stringify(song.chords)
    const seenArrange = useRef('')
    useEffect(() => {
        if (seenArrange.current === '') {
            seenArrange.current = arrangeStamp
            return
        }
        if (seenArrange.current === arrangeStamp) return
        const timer = window.setTimeout(() => {
            seenArrange.current = arrangeStamp
            updateActive((current) => ({ ...current, revisions: pushRevision(current, 'Edited arrangement', Date.now()) }))
        }, 900)
        return () => window.clearTimeout(timer)
    }, [arrangeStamp])

    const libraryRef = useRef(library)
    useEffect(() => {
        const previous = libraryRef.current
        const timer = window.setTimeout(() => {
            const warning = writeLibrary(library)
            if (warning !== '') setError(warning)
            retainAudio(previous, library).catch(() => { /* a private window may block storage */ })
            libraryRef.current = library
        }, 500)
        return () => window.clearTimeout(timer)
    }, [library])

    const sheet = tracks.find((track) => track.id === sheetId) || null
    const peer = otherName.trim().length > 0 ? otherName.trim() : '…'

    async function onPlay(): Promise<void> {
        setError(null)
        try {
            engine().prime()
            if (clock.playing) engine().stop()
            else await engine().play()
            setClock(engine().snapshot())
        } catch (err) {
            setError(messageFrom(err))
        }
    }

    function onStop(): void {
        engine().stop()
        setClock(engine().snapshot())
    }

    function onBpm(value: string): void {
        const next = Number(value)
        if (!Number.isFinite(next)) return
        const rounded = Math.max(40, Math.min(200, Math.round(next)))
        if (rounded === bpm) return
        engine().setBpm(rounded)
        setBpm(rounded)
        setAudio({})
    }

    async function onRecord(track: Track, overdub: boolean): Promise<void> {
        const eng = engine()
        eng.beginCapture()
        setError(null)
        eng.setCountIn(countIn)
        try {
            await eng.record(track.id, overdub, tuneOf(track), track.bars)
            setClock(eng.snapshot())
            const message = eng.error()
            if (message.length > 0) setError(message)
        } catch (err) {
            setError(messageFrom(err))
        }
    }

    function patch(id: string, partial: Partial<Track>): void {
        setTracks((current) => current.map((track) => track.id === id ? { ...track, ...partial } : track))
        const next = tracks.find((track) => track.id === id)
        if (next != null && (partial.root != null || partial.scale != null || partial.strength != null || partial.bypass != null)) {
            engine().setTune(tuneOf({ ...next, ...partial }))
        }
    }

    function addTrack(): void {
        const id = 'track-' + Math.random().toString(36).slice(2, 8)
        setTracks((current) => current.concat([defaultTrack({
            id,
            name: 'Track ' + (current.length + 1),
            endBar: song.songBars,
        })]))
    }

    function applyWand(resolved: ReturnType<typeof localWand>, label: string): void {
        const added = resolved.tracks.filter((track) => track.wand)
        added.forEach((track, index) => {
            const part = resolved.arrangement.parts[index]
            if (part == null) return
            const rendered = renderPart(part, songRef.current.bpm, 44100)
            engine().loadSamples(track.id, rendered, 44100)
            setWaves((current) => ({ ...current, [track.id]: engine().peaks(track.id, 96) }))
        })
        const chords = parseProgression(resolved.arrangement.chords.join(' '))
        updateActive((current) => ({
            ...current,
            revisions: pushRevision(current, label, Date.now()),
            chords: chords.length > 0 ? chords : current.chords,
            barsEach: resolved.arrangement.barsEach,
            tracks: resolved.tracks,
        }))
        setError(null)
        setNote(resolved.note)
    }

    async function onWand(): Promise<void> {
        if (listening) return
        const recorded = song.tracks.find((track) => !track.wand && (audio[track.id] || track.audioId !== ''))
        const plan = listenPlan(recorded != null)
        if (recorded == null) engine().beginCapture()
        setListening(true)
        setError(null)
        setNote('Listening…')
        try {
            let samples = new Float32Array(0)
            let rate = engine().sampleRate()
            if (recorded != null) {
                const live = engine().copySamples(recorded.id)
                const clip = live != null ? live : recorded.audioId !== '' ? await recallAudio(recorded.audioId) : null
                if (clip != null) {
                    samples = clip.samples
                    rate = clip.rate
                }
                await new Promise((resolve) => window.setTimeout(resolve, plan.ms))
            } else {
                samples = await engine().listen(plan.ms)
                rate = engine().sampleRate()
            }
            const profile = listenToVocal(samples, rate, songRef.current.bpm)
            profile.vocalVolume = recorded != null ? recorded.volume : 80
            wandTap.current += 1
            const seed = (Math.floor(performance.now()) + wandTap.current * 0x9E3779B1) >>> 0
            const built = localWand(profile, seed, songRef.current.tracks, Date.now())
            applyWand(built, 'Before magic wand')
        } catch (err) {
            setError('The wand could not listen. Your recording is still here.')
            setNote('')
        } finally {
            setListening(false)
        }
    }

    function removeWand(): void {
        updateActive((current) => ({ ...current, tracks: current.tracks.filter((track) => !track.wand) }))
    }

    async function exportSong(preferWav: boolean): Promise<void> {
        setNote('Rendering…')
        const clips: Record<string, { samples: Float32Array, rate: number }> = {}
        for (let i = 0; i < song.tracks.length; i++) {
            const track = song.tracks[i]
            const live = engine().copySamples(track.id)
            if (live != null) clips[track.id] = live
            else if (track.audioId !== '') {
                const stored = await recallAudio(track.audioId)
                if (stored != null) clips[track.id] = stored
            }
        }
        try {
            const result = await bounce(song, clips, (amount) => setNote('Rendering ' + Math.round(amount * 100) + '%'), preferWav)
            const safe = song.name.replace(/[^a-z0-9\- ]/gi, '').trim() || 'song'
            const saved = await saveBytes(safe + '.' + result.extension, result.bytes, result.mime)
            const fallback = !preferWav && result.kind === 'wav' ? 'This phone saved a WAV instead of AAC. ' : ''
            setNote(fallback + saved)
        } catch (err) {
            setNote('The mix could not be rendered.')
        }
    }

    function removeTrack(id: string): void {
        engine().removeTrack(id)
        setTracks((current) => current.filter((track) => track.id !== id))
        if (sheetId === id) setSheetId(null)
    }

    function onClearSong(): void {
        const nextSong = defaultSong({ id: song.id, name: song.name, bpm: song.bpm })
        const next = {
            ...library,
            songs: library.songs.map((item) => item.id === library.activeId ? nextSong : item),
        }
        engine().clearSongAudio()
        savedAudio.current = {}
        setAudio({})
        setWaves({})
        setTakeLine('')
        setError(null)
        setResults([])
        setNote('Cleared. This song is empty.')
        setLibrary(next)
        const warning = writeLibrary(next)
        if (warning !== '') setError(warning)
        retainAudio(library, next).catch(() => { /* a private window may block storage */ })
    }

    async function onTest(): Promise<void> {
        const eng = engine()
        eng.prime()
        setTesting(true)
        setError(null)
        setResults([{ name: 'Running', pass: true, detail: 'Injecting a test voice…' }])
        const lines: TestLine[] = []
        try {
            const track = tracksRef.current[0]
            if (track == null) throw new Error('Add a track first.')
            eng.setCountIn(false)
            eng.setInputTrim(1)
            eng.configure(track.id, {
                bars: 'free',
                preGapBeats: 0,
                postGapBeats: 0,
                preGapMs: 0,
                postGapMs: 0,
                startBar: track.startBar,
                endBar: Math.max(track.endBar, 4),
                distortMix: 0,
                distortPoints: track.distort.points,
                sections: [],
            })
            patch(track.id, { bars: 'free', strength: 0, bypass: true, preGapBeats: 0, postGapBeats: 0, preGapMs: 0, postGapMs: 0 })
            await new Promise((resolve) => window.requestAnimationFrame(() => resolve(null)))
            const samples = testVoice(eng.sampleRate(), 0.5)
            eng.armInjection(samples)
            await eng.record(track.id, false, { root: track.root, scale: track.scale, strength: 0, bypass: true }, 'free')
            const take = await eng.waitForTake(4000)
            const saved = take != null && take.rms >= 0.08 && take.samples > eng.sampleRate() * 0.2
            lines.push({
                name: 'Saved',
                pass: saved,
                detail: take == null
                    ? 'No take arrived (' + eng.clockState() + ')'
                    : 'RMS ' + take.rms.toFixed(3) + ' · ' + take.via + ' · ' + take.samples + ' samples',
            })
            const wave = eng.peaks(track.id, 96)
            setWaves((current) => ({ ...current, [track.id]: wave }))
            const drawn = waveformHasEnergy(wave)
            lines.push({ name: 'Waveform', pass: drawn, detail: drawn ? 'Peaks are drawn from the buffer' : 'The buffer is flat' })
            const first = await eng.measureOutput(450)
            await new Promise((resolve) => window.setTimeout(resolve, 420))
            const second = await eng.measureOutput(300)
            const looped = first >= 0.05 && second >= 0.05
            lines.push({
                name: 'Playback',
                pass: looped,
                detail: 'Output RMS ' + first.toFixed(3) + ' then ' + second.toFixed(3) + ' · ' + eng.clockState(),
            })
            const tone = sineTone(eng.sampleRate(), 450, 0.85)
            eng.armInjection(tone)
            await eng.record(track.id, false, { root: 9, scale: 'Major', strength: 100, bypass: false }, 'free')
            await eng.waitForTake(4000)
            const tunedClip = eng.copySamples(track.id)
            const tunedTail = tunedClip == null ? null : tunedClip.samples.subarray(Math.floor(tunedClip.samples.length * 0.6))
            const tunedHz = tunedTail == null ? 0 : estimatePitch(tunedTail, tunedClip == null ? eng.sampleRate() : tunedClip.rate)
            const tuneCents = Math.abs(centsBetween(tunedHz, 440))
            const tunePass = tunedHz > 0 && tuneCents <= 20
            lines.push({
                name: 'Auto-tune',
                pass: tunePass,
                detail: '450 → ' + (tunedHz > 0 ? tunedHz.toFixed(0) : '?') + ' Hz' + (tunePass ? ' ✓' : ''),
            })
            const profile = listenToVocal(samples, eng.sampleRate(), songRef.current.bpm)
            profile.vocalVolume = track.volume
            const built = localWand(profile, 1, songRef.current.tracks, Date.now())
            const other = localWand(profile, 2, songRef.current.tracks, Date.now() + 1)
            const added = built.tracks.filter((item) => item.wand)
            const kept = built.tracks.find((item) => item.id === track.id)
            let wandOk = added.length >= 2 && kept != null && !kept.wand && wandStamp(built) !== wandStamp(other)
            applyWand(built, 'Before test wand')
            added.forEach((item) => {
                if (!waveformHasEnergy(eng.peaks(item.id, 64))) wandOk = false
            })
            lines.push({ name: 'Magic wand', pass: wandOk, detail: built.note })
        } catch (err) {
            lines.push({ name: 'Test', pass: false, detail: messageFrom(err) })
        }
        setResults(lines)
        setTesting(false)
    }

    return <Root>
        <Scroller>
        <Header>
            <Title>Voice Looper</Title>
            <Subtitle>On a call with {peer} · 4/4 · {bpm} BPM</Subtitle>
            <Transport>
                <Pill type="button" $on={metronome} onClick={() => {
                    const next = !metronome
                    setMetronome(next)
                    engine().setMetronome(next)
                }}>Click</Pill>
                <Pill type="button" $on={countIn} onClick={() => {
                    const next = !countIn
                    setCountIn(next)
                    engine().setCountIn(next)
                }}>{countIn ? 'Count-in' : 'No count-in'}</Pill>
                <BpmPill>
                    <BpmInput
                        id="VoiceLooperBpm"
                        aria-label="BPM"
                        type="number"
                        min={40}
                        max={200}
                        value={bpm}
                        onChange={(event) => onBpm(event.target.value)}
                    />
                    <span>BPM</span>
                </BpmPill>
            </Transport>
            <ProgressTrack>
                <ProgressFill style={{ width: (masterProgress(clock.elapsed, bpm) * 100) + '%' }} />
            </ProgressTrack>
            <ProgressMeta>
                <span>Beat {masterBeat(clock.elapsed, bpm)}</span>
                <span>{masterLeft(clock.elapsed, bpm).toFixed(1)}s</span>
            </ProgressMeta>
            {(error != null || clock.phase != null || takeLine !== '') && <ErrorText $bad={error != null} role="status">
                {error != null
                    ? error
                    : clock.phase === 'count-in'
                        ? 'Count-in…'
                        : clock.phase === 'recording'
                            ? (tracks.find((item) => item.id === clock.recordId)?.bars === 'free' ? 'Recording… tap Rec again to loop it.' : 'Recording…')
                            : takeLine}
            </ErrorText>}
        </Header>
        <List>
            {tracks[0] != null && !tracks.some((item) => audio[item.id] || item.audioId !== '') &&
                <Add type="button" id="VoiceLooperBigRec" onClick={() => onRecord(tracks[0], false)}>Record</Add>}
            <ToolRow>
                <ToolButton type="button" id="VoiceLooperWand" $listen={listening} aria-label="Magic wand" title={listening ? 'Listening…' : 'Magic wand'} onClick={() => { void onWand() }}><WandIcon /></ToolButton>
                <ToolButton type="button" id="VoiceLooperClear" aria-label="Clear" title="Clear" onClick={onClearSong}><ClearIcon /></ToolButton>
                <ToolButton type="button" id="VoiceLooperTest" aria-label="Test" title="Test" disabled={testing} onClick={() => { void onTest() }}><TestIcon /></ToolButton>
            </ToolRow>
            {note !== '' && <ToolNote role="status">{note}</ToolNote>}
            {tracks.some((item) => item.wand) && <Add type="button" onClick={removeWand}>Remove wand tracks</Add>}
            {results.length > 0 && <Results id="VoiceLooperTestResults">
                {results.map((line) =>
                    <Result key={line.name} $pass={line.pass}>{line.pass ? 'Pass' : 'Fail'} · {line.name} · {line.detail}</Result>
                )}
            </Results>}
            {tracks.map((track) => {
                const recording = clock.recordId === track.id
                return <Row key={track.id} id={'loop-track-' + track.id}>
                    <RowLine>
                        {editing === track.id
                            ? <NameInput
                                aria-label="Track name"
                                value={track.name}
                                autoFocus
                                maxLength={24}
                                onChange={(event) => patch(track.id, { name: event.target.value })}
                                onBlur={() => setEditing(null)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') setEditing(null)
                                }}
                            />
                            : <Name>{track.name}{audio[track.id] ? ' ·' : ''}</Name>}
                        <IconButton type="button" aria-label={'Rename ' + track.name} onClick={() => setEditing(track.id)}>
                            <Pencil />
                        </IconButton>
                        <VolumePie label={track.name + ' volume'} value={track.volume} onChange={(volume) => patch(track.id, { volume })} />
                        <Chip type="button" onClick={() => setSheetId(track.id)}>{keyLabel(track.root, track.scale)}</Chip>
                        <Chip type="button" onClick={() => setSheetId(track.id)}>{tuneLabel(track)}</Chip>
                    </RowLine>
                    <RowLine>
                        {LENGTHS.map((length) =>
                            <Chip
                                key={String(length)}
                                type="button"
                                $on={track.bars === length}
                                onClick={() => {
                                    engine().setLength(track.id, length)
                                    patch(track.id, { bars: length })
                                    setAudio((current) => ({ ...current, [track.id]: false }))
                                }}
                            >{length === 'free' ? 'Free' : length + (length === 1 ? ' bar' : ' bars')}</Chip>
                        )}
                    </RowLine>
                    <TrackWave peaks={waves[track.id]} progress={clock.progress[track.id] || 0} label={'Waveform of ' + track.name} />
                    <RowLine>
                        <Tiny
                            type="button"
                        $hot={recording && !clock.overdub}
                        aria-label={'Record ' + track.name}
                        onClick={() => onRecord(track, false)}
                    >{recording && clock.phase === 'count-in' ? 'Count' : recording && track.bars === 'free' && !clock.overdub ? 'Stop' : 'Rec'}</Tiny>
                        <Tiny
                            type="button"
                            $hot={recording && clock.overdub}
                            aria-label={'Overdub ' + track.name}
                            onClick={() => onRecord(track, true)}
                        >Dub</Tiny>
                        <Tiny
                            type="button"
                            $on={track.muted}
                            aria-label={'Mute ' + track.name}
                            onClick={() => patch(track.id, { muted: !track.muted })}
                        >{track.muted ? 'Muted' : 'Mute'}</Tiny>
                        <IconButton type="button" aria-label={'Remove ' + track.name} onClick={() => removeTrack(track.id)}>×</IconButton>
                    </RowLine>
                </Row>
            })}
            <Add type="button" id="VoiceLooperAdd" onClick={addTrack}>Add track</Add>
        </List>
        </Scroller>
        <PlayBar>
            <PlayPanel>
            <Play type="button" id="VoiceLooperPlay" aria-label={clock.playing ? 'Pause' : 'Play'} onClick={onPlay}>
                {clock.playing ? <Pause /> : <Triangle />}
            </Play>
            <Round type="button" id="VoiceLooperStop" aria-label="Stop" onClick={onStop}><Square /></Round>
            <Round type="button" aria-label={sheetOpen ? 'Close song tools' : 'Open song tools'} onClick={() => setSheetOpen((open) => !open)}>
                <Chevron $up={!sheetOpen} />
            </Round>
            <MeterButton
                type="button"
                id="VoiceLooperMeter"
                aria-expanded={sheetOpen && tab === 'Mic'}
                aria-label={level.ready ? (level.hearing ? 'Microphone hears you' : 'Can\'t hear you') : 'Microphone level'}
                onClick={() => {
                    setTab('Mic')
                    setSheetOpen(true)
                }}
            >
                <MeterSlots>
                    {[0, 1, 2, 3].map((bar) => {
                        const scale = meterScale(level.rms, bar)
                        const lit = scale > 6 / 22 + 0.05
                        return <MeterBar key={bar} $on={lit} $hot={level.hearing && lit} style={{ transform: 'scaleY(' + scale.toFixed(3) + ')' }} />
                    })}
                </MeterSlots>
            </MeterButton>
            {clock.phase === 'recording' && !level.hearing && clock.elapsed > 1.2 &&
                <MeterHint role="status">{error != null && error.toLowerCase().indexOf('microphone') >= 0 ? 'Mic blocked' : 'Can\'t hear you'}</MeterHint>}
            </PlayPanel>
        </PlayBar>
        {sheetOpen && <PlaySheet
            song={song}
            tab={tab}
            elapsed={clock.elapsed}
            level={level}
            error={error}
            inputTrim={inputTrim}
            note={note}
            waveRef={waveRef}
            waves={waves}
            songs={library.songs.map((item) => ({ id: item.id, name: item.name, updated: item.updated, bars: item.songBars, bpm: item.bpm }))}
            onTab={setTab}
            onClose={() => setSheetOpen(false)}
            onSeek={(seconds) => engine().seek(seconds)}
            onBars={(bars) => updateActive((current) => ({ ...current, songBars: bars }))}
            onTrack={(id, partial) => {
                updateActive((current) => ({
                    ...current,
                    tracks: current.tracks.map((item) => item.id === id ? { ...item, ...partial } : item),
                }))
            }}
            onChords={(text) => updateActive((current) => ({ ...current, chords: parseChords(text) }))}
            onBarsEach={(bars) => updateActive((current) => ({ ...current, barsEach: bars }))}
            onFollow={(on) => updateActive((current) => ({ ...current, followChords: on }))}
            onMetronomeVolume={(volume) => updateActive((current) => ({ ...current, metronomeVolume: volume }))}
            onTrim={(value) => { setInputTrim(value); engine().setInputTrim(value / 100) }}
            onSaveRevision={() => updateActive((current) => ({ ...current, revisions: pushRevision(current, 'Saved version', Date.now()) }))}
            onRestore={(id) => updateActive((current) => {
                const revision = current.revisions.find((item) => item.id === id)
                if (revision == null) return current
                return restoreRevision(current, revision, Date.now())
            })}
            onPreview={(id) => {
                const revision = song.revisions.find((item) => item.id === id)
                if (revision == null) return
                engine().seek(0)
                engine().play().catch((err) => setError(messageFrom(err)))
                setNote('Playing the saved version. Restore keeps it.')
            }}
            onRename={(name) => updateActive((current) => ({ ...current, name }))}
            onDuplicate={() => setLibrary((current) => {
                const source = current.songs.find((item) => item.id === current.activeId) || current.songs[0]
                const copy = defaultSong({ ...source, id: 'song-' + Date.now(), name: source.name + ' copy', revisions: [] })
                return { ...current, activeId: copy.id, songs: current.songs.concat([copy]) }
            })}
            onClear={onClearSong}
            onWav={() => { void exportSong(true) }}
            onMp4={() => { void exportSong(false) }}
            onNew={() => setLibrary((current) => {
                const created = defaultSong({ id: 'song-' + Date.now(), name: 'Song ' + (current.songs.length + 1) })
                return { ...current, activeId: created.id, songs: current.songs.concat([created]) }
            })}
            onSwitch={(id) => {
                engine().stop()
                setLibrary((current) => ({ ...current, activeId: id }))
            }}
        />}
        {sheet != null && <SheetBackdrop onClick={() => setSheetId(null)}>
            <Sheet role="dialog" aria-label={'Auto-tune ' + sheet.name} onClick={(event) => event.stopPropagation()}>
                <SheetHead>
                    <SheetTitle>Auto-tune · {sheet.name}</SheetTitle>
                    <IconButton type="button" aria-label="Close" onClick={() => setSheetId(null)}>×</IconButton>
                </SheetHead>
                <FieldLabel>Strength {sheet.strength}%</FieldLabel>
                <Range
                    aria-label="Strength"
                    type="range"
                    min={0}
                    max={100}
                    value={sheet.strength}
                    onChange={(event) => patch(sheet.id, { strength: Number(event.target.value), bypass: false })}
                />
                <FieldLabel>Key</FieldLabel>
                <ChipGrid>
                    {NOTES.map((note, index) =>
                        <Chip key={note} type="button" $on={sheet.root === index} onClick={() => patch(sheet.id, { root: index })}>{note}</Chip>
                    )}
                </ChipGrid>
                <FieldLabel>Scale</FieldLabel>
                <ChipGrid>
                    {SCALES.map((scale) =>
                        <Chip key={scale} type="button" $on={sheet.scale === scale} onClick={() => patch(sheet.id, { scale })}>{scale}</Chip>
                    )}
                </ChipGrid>
                <FieldLabel>Volume {sheet.volume}%</FieldLabel>
                <Range
                    aria-label="Volume"
                    type="range"
                    min={0}
                    max={100}
                    value={sheet.volume}
                    onChange={(event) => patch(sheet.id, { volume: Number(event.target.value) })}
                />
                <Chip type="button" $on={sheet.bypass} onClick={() => patch(sheet.id, { bypass: !sheet.bypass })}>
                    {sheet.bypass || sheet.strength <= 0 ? 'Tune off' : 'Tune on'}
                </Chip>
            </Sheet>
        </SheetBackdrop>}
    </Root>
}

function TrackWave(props: { peaks?: Float32Array, progress: number, label: string }): JSX.Element {
    const ref = useRef<HTMLCanvasElement | null>(null)
    useEffect(() => {
        const canvas = ref.current
        if (canvas == null) return
        drawWaveform(canvas, props.peaks, '#1f6b3a')
    }, [props.peaks])
    return <WaveBox>
        <canvas ref={ref} width={360} height={36} aria-label={props.label} />
        <WaveHead style={{ left: (Math.max(0, Math.min(1, props.progress)) * 100) + '%' }} />
    </WaveBox>
}

function VolumePie(props: { label: string, value: number, onChange: (value: number) => void }): JSX.Element {
    const ref = useRef<HTMLButtonElement | null>(null)
    const drag = useRef<{ x: number, y: number, value: number } | null>(null)
    const [hot, setHot] = useState(false)
    const [keyFocus, setKeyFocus] = useState(false)
    const fromPointer = useRef(false)
    const value = clampVolume(props.value)
    const wedge = pieWedge(value, 18, 18, 14)
    function bounds(): { left: number, top: number, width: number, height: number } {
        const el = ref.current
        if (el == null) return { left: 0, top: 0, width: 44, height: 44 }
        const rect = el.getBoundingClientRect()
        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    }
    function nudge(next: number): void {
        props.onChange(clampVolume(next))
    }
    return <PieButton
        ref={ref}
        type="button"
        $hot={hot}
        $key={keyFocus}
        role="slider"
        aria-label={props.label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-orientation="vertical"
        onFocus={() => { if (!fromPointer.current) setKeyFocus(true) }}
        onKeyDown={(event) => {
            if (event.key === 'ArrowUp' || event.key === 'ArrowRight') nudge(value + 5)
            else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') nudge(value - 5)
            else if (event.key === 'Home') nudge(0)
            else if (event.key === 'End') nudge(100)
            else return
            event.preventDefault()
        }}
        onBlur={() => setKeyFocus(false)}
        onPointerDown={(event) => {
            fromPointer.current = true
            setKeyFocus(false)
            event.currentTarget.setPointerCapture(event.pointerId)
            drag.current = { x: event.clientX, y: event.clientY, value }
            setHot(true)
        }}
        onPointerMove={(event) => {
            const start = drag.current
            if (start == null) return
            props.onChange(volumeFromGesture(start, { x: event.clientX, y: event.clientY }, bounds()))
        }}
        onPointerUp={() => {
            fromPointer.current = false
            drag.current = null
            setHot(false)
        }}
        onPointerCancel={() => {
            fromPointer.current = false
            drag.current = null
            setHot(false)
        }}
    >
        <svg viewBox="0 0 36 36" width="36" height="36" aria-hidden="true">
            <circle cx="18" cy="18" r="15.25" fill="#e7edf3" stroke="#b8c2cc" strokeWidth="1.5" />
            {wedge !== '' ? <path d={wedge} fill="#2f7a45" /> : null}
            <line x1="18" y1="1.5" x2="18" y2="5" stroke="#1f2a24" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <PieReadout>{value}</PieReadout>
    </PieButton>
}

function tuneLabel(track: { bypass: boolean, strength: number }): string {
    if (track.bypass || track.strength <= 0) return 'Tune off'
    return 'Tune ' + track.strength + '%'
}

function Chevron(props: { $up?: boolean }): JSX.Element {
    return <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style={{ transform: props.$up ? 'none' : 'rotate(180deg)' }}>
        <path d="M3 10.5 L8 5.5 L13 10.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
}

function drawWave(canvas: HTMLCanvasElement, wave: Float32Array): void {
    const ctx = canvas.getContext('2d')
    if (ctx == null) return
    const width = canvas.width
    const height = canvas.height
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#e7edf3'
    ctx.fillRect(0, 0, width, height)
    ctx.strokeStyle = '#2f7a45'
    ctx.lineWidth = 2
    ctx.beginPath()
    const step = Math.max(1, Math.floor(wave.length / width))
    for (let x = 0; x < width; x++) {
        const sample = wave[Math.min(wave.length - 1, x * step)] || 0
        const y = height / 2 - sample * (height * 0.45)
        if (x === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
    }
    ctx.stroke()
}

function masterProgress(elapsed: number, bpm: number): number {
    const bar = barSeconds(bpm)
    if (!(elapsed > 0)) return 0
    return (elapsed % bar) / bar
}

function masterBeat(elapsed: number, bpm: number): number {
    const bar = barSeconds(bpm)
    if (!(elapsed > 0)) return 1
    return Math.floor((elapsed % bar) / (bar / 4)) + 1
}

function masterLeft(elapsed: number, bpm: number): number {
    const bar = barSeconds(bpm)
    if (!(elapsed > 0)) return bar
    return bar - (elapsed % bar)
}

function parseChords(text: string): Song['chords'] {
    const parsed = parseProgression(text)
    return parsed.length > 0 ? parsed : parseProgression('I V vi IV')
}

function isLength(value: LoopLength | undefined): value is LoopLength {
    return value === 1 || value === 2 || value === 4 || value === 8 || value === 'free'
}

function messageFrom(err: unknown): string {
    if (err instanceof Error && err.message.length > 0 && err.message.length < 180) return err.message
    return 'The looper could not use the microphone.'
}

function clampIndex(value: number): number {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.min(11, Math.round(value)))
}

function clampPercent(value: number, fallback: number): number {
    if (!Number.isFinite(value)) return fallback
    return Math.max(0, Math.min(100, Math.round(value)))
}

function isScale(value: string): value is ScaleName {
    return SCALES.indexOf(value as ScaleName) >= 0
}

function cleanRemote(track: Track): Track {
    return defaultTrack({
        id: typeof track.id === 'string' ? track.id.slice(0, 40) : 'track',
        name: typeof track.name === 'string' ? track.name.slice(0, 24) : 'Track',
        root: clampIndex(track.root),
        scale: isScale(track.scale) ? track.scale : 'Major',
        strength: clampPercent(track.strength, 70),
        bypass: Boolean(track.bypass),
        volume: clampPercent(track.volume, 80),
        muted: Boolean(track.muted),
        bars: isLength(track.bars) ? track.bars : 4,
    })
}

const raised = '0.22rem 0.22rem 0.45rem rgb(195 193 198 / 90%), -0.12rem -0.12rem 0.35rem #fff'
const inset = 'inset 0.15rem 0.15rem 0.35rem rgb(195 193 198 / 90%), inset -0.1rem -0.1rem 0.3rem #fff'

const PlayBar = styled.div`
    position: fixed;
    z-index: 20;
    /* Equal insets inside the space left of the card switcher (60px button + 15px inset). */
    left: 12px;
    right: 87px;
    bottom: calc(78px + env(safe-area-inset-bottom));
    display: flex;
    pointer-events: none;
`

const PlayPanel = styled.div`
    pointer-events: auto;
    display: flex;
    align-items: center;
    justify-content: space-evenly;
    gap: 6px;
    width: 100%;
    height: 92px;
    padding: 0 8px;
    box-sizing: border-box;
    border-radius: 28px;
    background: rgb(223 229 236 / 92%);
    box-shadow: 0 8px 24px rgb(31 42 36 / 12%);
`

const MeterButton = styled.button`
    width: 56px;
    height: 48px;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 16px;
    background: #e0e5ec;
    box-shadow: ${raised};
    display: flex;
    align-items: center;
    justify-content: center;
`

const MeterSlots = styled.span`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    width: 39px;
    height: 22px;
`

const MeterBar = styled.span<{ $on?: boolean, $hot?: boolean }>`
    width: 6px;
    height: 22px;
    border-radius: 99px;
    transform-origin: center center;
    transition: transform 90ms linear, background-color 90ms linear;
    background: ${p => p.$hot && p.$on ? '#2f7a45' : p.$on ? '#3d8f57' : '#b8c2cc'};
`

const MeterHint = styled.p`
    margin: 0;
    color: #9a3b32;
    font-size: 13px;
    font-weight: 700;
`

const MeterSheet = styled.section`
    position: absolute;
    z-index: 30;
    left: 12px;
    right: 87px;
    bottom: calc(146px + env(safe-area-inset-bottom));
    max-height: 62vh;
    overflow: auto;
    padding: 8px 14px calc(18px + env(safe-area-inset-bottom));
    border-radius: 18px 18px 0 0;
    background: #DFE5EC;
    box-shadow: 0 -12px 30px rgb(120 130 140 / 28%);
`

const Handle = styled.button`
    display: block;
    width: 48px;
    height: 6px;
    margin: 4px auto 10px;
    border: 0;
    border-radius: 99px;
    background: #b7c0c8;
`

const MeterTitle = styled.h2`
    margin: 0 0 8px;
    font-size: 16px;
`

const WaveCanvas = styled.canvas`
    width: 100%;
    height: 96px;
    border-radius: 12px;
    background: #e7edf3;
`

const MeterReadout = styled.div`
    display: flex;
    gap: 12px;
    align-items: center;
    margin: 8px 0;
    font-size: 13px;
    font-weight: 700;
`

const Clip = styled.span<{ $on?: boolean }>`
    padding: 2px 8px;
    border-radius: 99px;
    background: ${p => p.$on ? '#b42318' : '#d5dbe3'};
    color: ${p => p.$on ? 'white' : '#6b7780'};
`

const Root = styled.div`
    position: absolute;
    inset: 0;
    background: #DFE5EC;
    color: #243038;
    touch-action: manipulation;
`

const Scroller = styled.div`
    position: absolute;
    /* The floating hand occupies the top-right corner. The scrollport starts below it. */
    top: calc(90px + env(safe-area-inset-top));
    right: 0;
    bottom: 0;
    left: 0;
    overflow: auto;
`

const Header = styled.header`
    padding: 6px 16px 8px;
`

const Title = styled.h1`
    margin: 0;
    font-size: 22px;
    font-weight: 750;
    letter-spacing: 0;
`

const Subtitle = styled.p`
    margin: 4px 0 12px;
    font-size: 13px;
    color: #5c6b76;
`

const Transport = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
`

const Round = styled.button`
    width: 48px;
    height: 48px;
    border: 0;
    border-radius: 999px;
    background: #e0e5ec;
    box-shadow: ${raised};
    color: #243038;
    outline: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    &:focus-visible {
        outline: 2px solid rgb(47 122 69 / 40%);
        outline-offset: 2px;
    }
`

const Play = styled(Round)`
    width: 72px;
    height: 72px;
    background: #2f7a45;
    color: white;
`

const Pill = styled.button<{ $on?: boolean }>`
    border: 0;
    border-radius: 999px;
    background: #e0e5ec;
    box-shadow: ${p => p.$on ? inset : raised};
    color: #243038;
    font: inherit;
    font-size: 14px;
    font-weight: 700;
    padding: 8px 14px;
`

const BpmPill = styled.label`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border-radius: 999px;
    background: #e0e5ec;
    box-shadow: ${raised};
    padding: 6px 12px;
    font-size: 14px;
    font-weight: 700;
`

const BpmInput = styled.input`
    width: 42px;
    border: 0;
    background: transparent;
    font: inherit;
    font-weight: 700;
    color: inherit;
    padding: 0;
`

const ProgressTrack = styled.div`
    margin-top: 14px;
    height: 10px;
    border-radius: 999px;
    background: #d5dbe3;
    box-shadow: ${inset};
    overflow: hidden;
`

const ProgressFill = styled.div`
    height: 100%;
    background: #3ddc6a;
    border-radius: 999px;
`

const ProgressMeta = styled.div`
    display: flex;
    justify-content: space-between;
    margin-top: 6px;
    font-size: 13px;
    font-weight: 650;
    color: #3d4c46;
`

const ErrorText = styled.p<{ $bad?: boolean }>`
    margin: 8px 0 0;
    color: ${p => p.$bad ? '#9d1c1c' : '#243038'};
    font-size: 14px;
`

const ToolRow = styled.div`
    display: flex;
    gap: 10px;
    align-items: center;
`

const wandPulse = keyframes`
    0% { transform: scale(1); }
    50% { transform: scale(1.14); }
    100% { transform: scale(1); }
`

const ToolButton = styled.button<{ $listen?: boolean }>`
    width: 44px;
    height: 44px;
    border: 0;
    border-radius: 14px;
    background: #e0e5ec;
    box-shadow: ${p => p.$listen ? '0 0 0 3px #2f7a45' : raised};
    color: ${p => p.$listen ? '#1f6b3a' : '#243038'};
    display: inline-flex;
    align-items: center;
    justify-content: center;
    animation: ${p => p.$listen ? wandPulse : 'none'} 0.8s ease-in-out infinite;
    &:disabled { opacity: 0.45; }
`

const ToolNote = styled.p`
    margin: 0;
    max-width: 280px;
    color: #5c6b76;
    font-size: 13px;
    font-weight: 650;
`

const Results = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 10px;
    border-radius: 14px;
    background: #e7eef3;
`

const Result = styled.p<{ $pass?: boolean }>`
    margin: 0;
    font-size: 13px;
    font-weight: 700;
    color: ${p => p.$pass ? '#1f6b3a' : '#9d1c1c'};
`

const WaveBox = styled.div`
    position: relative;
    height: 36px;
    border-radius: 10px;
    overflow: hidden;
    background: #e7edf3;
    canvas {
        width: 100%;
        height: 36px;
        display: block;
    }
`

const WaveHead = styled.div`
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: #243038;
`

const PieButton = styled.button<{ $hot?: boolean, $key?: boolean }>`
    margin-left: auto;
    width: 44px;
    height: 44px;
    flex: 0 0 44px;
    border: 0;
    border-radius: 50%;
    position: relative;
    padding: 0;
    touch-action: none;
    outline: none;
    z-index: ${p => p.$hot ? 50 : 1};
    transform: ${p => p.$hot ? 'translateY(-40px) scale(1.85)' : 'none'};
    background: ${p => p.$hot ? '#f7f9f8' : 'transparent'};
    box-shadow: ${p => p.$hot ? '0 10px 28px rgb(31 42 36 / 22%)' : 'none'};
    display: inline-flex;
    align-items: center;
    justify-content: center;
    svg { display: block; width: 36px; height: 36px; }
    &:focus { outline: none; }
    ${p => p.$key ? '&:focus { outline: 2px solid rgb(47 122 69 / 40%); outline-offset: 2px; }' : ''}
`

const PieReadout = styled.span`
    position: absolute;
    left: 50%;
    top: 50%;
    width: 24px;
    height: 14px;
    transform: translate(-50%, -50%);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 7px;
    background: #fff;
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
    letter-spacing: -0.03em;
    pointer-events: none;
    color: #1f2a24;
`

const List = styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 8px 16px calc(204px + env(safe-area-inset-bottom));
`

const Row = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    border-radius: 18px;
    background: #e7eef3;
    box-shadow: ${raised};
    overflow: visible;
`

const RowLine = styled.div`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
`

const Name = styled.span`
    font-size: 15px;
    font-weight: 750;
`

const NameInput = styled.input`
    width: 110px;
    border: 0;
    border-radius: 999px;
    background: #DFE5EC;
    box-shadow: ${inset};
    font: inherit;
    font-weight: 700;
    padding: 4px 10px;
    color: inherit;
`

const IconButton = styled.button`
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 999px;
    background: #e0e5ec;
    box-shadow: ${raised};
    color: #243038;
    font-size: 18px;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
`

const Chip = styled.button<{ $on?: boolean }>`
    border: 0;
    border-radius: 999px;
    background: ${p => p.$on ? '#2f7a45' : '#e0e5ec'};
    box-shadow: ${p => p.$on ? 'none' : raised};
    color: ${p => p.$on ? 'white' : '#243038'};
    font: inherit;
    font-size: 13px;
    font-weight: 700;
    padding: 6px 10px;
`

const Tiny = styled.button<{ $hot?: boolean, $on?: boolean }>`
    border: 0;
    border-radius: 999px;
    background: ${p => p.$hot ? '#e23d3d' : '#e0e5ec'};
    color: ${p => p.$hot ? 'white' : '#243038'};
    box-shadow: ${p => p.$on ? inset : raised};
    font: inherit;
    font-size: 12px;
    font-weight: 750;
    padding: 6px 10px;
`

const Add = styled.button`
    align-self: flex-start;
    border: 0;
    border-radius: 999px;
    background: #e0e5ec;
    box-shadow: ${raised};
    font: inherit;
    font-weight: 750;
    padding: 10px 16px;
    color: #2f7a45;
`

const SheetBackdrop = styled.div`
    position: absolute;
    inset: 0;
    background: rgba(20, 28, 32, 0.28);
    display: flex;
    align-items: flex-end;
    z-index: 5;
`

const Sheet = styled.div`
    width: 100%;
    max-height: 78%;
    overflow: auto;
    box-sizing: border-box;
    padding: 14px 16px calc(110px + env(safe-area-inset-bottom));
    border-radius: 18px 18px 0 0;
    background: #DFE5EC;
    box-shadow: 0 -8px 24px rgba(20, 28, 32, 0.16);
`

const SheetHead = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
`

const SheetTitle = styled.h2`
    margin: 0;
    font-size: 18px;
    font-weight: 750;
`

const FieldLabel = styled.div`
    margin: 12px 0 6px;
    font-size: 13px;
    font-weight: 700;
    color: #5c6b76;
`

const Range = styled.input`
    width: 100%;
`

const ChipGrid = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
`

function Square(): JSX.Element {
    return <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect width="14" height="14" rx="2" fill="currentColor" /></svg>
}

function Triangle(): JSX.Element {
    return <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><path d="M7 4 L18 11 L7 18 Z" fill="currentColor" /></svg>
}

function Pause(): JSX.Element {
    return <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><rect x="3" y="2" width="4" height="14" fill="currentColor" /><rect x="11" y="2" width="4" height="14" fill="currentColor" /></svg>
}

function sineTone(rate: number, freq: number, seconds: number): Float32Array {
    const length = Math.max(1, Math.floor(rate * seconds))
    const out = new Float32Array(length)
    for (let i = 0; i < length; i++) out[i] = Math.sin(2 * Math.PI * freq * i / rate) * 0.5
    return out
}

function wandStamp(built: { arrangement: { chords: string[], parts: { notes: string[], pattern: string[] }[] } }): string {
    return built.arrangement.chords.join(',') + '|' + built.arrangement.parts.map((part) => part.notes.join('.') + '/' + part.pattern.join('.')).join(';')
}

function WandIcon(): JSX.Element {
    return <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <path d="M4 18 L14 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M13 5 L15 7 L17 5 L15 3 Z" fill="currentColor" />
        <path d="M16 12 L16 15 M14.5 13.5 L17.5 13.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
}

function ClearIcon(): JSX.Element {
    return <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M5 6 H15 L14 17 H6 Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 6 V4 H12 V6 M8 9 V14 M12 9 V14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
}

function TestIcon(): JSX.Element {
    return <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <path d="M3 12 H7 L9 6 L12 16 L14 10 H19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
}

function Pencil(): JSX.Element {
    return <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 10.5 L8.8 3.7 L10.3 5.2 L3.5 12 H2 Z M9.4 3.1 L10.5 2 L12 3.5 L10.9 4.6 Z" fill="currentColor" /></svg>
}
