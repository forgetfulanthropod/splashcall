import React, { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import { useAppContext } from '../../context'
import { clearDataEvent, emitDataEvent, onDataEvent } from '../../connection/dataConn'
import { LoopEngine, TuneSettings } from './engine'
import { keyLabel, NOTES, ScaleName } from './theory'

const SCALES: ScaleName[] = ['Major', 'Minor', 'Dorian', 'Mixolydian', 'Pentatonic']
const BAR_CHOICES = [2, 4, 8, 16]

type Track = {
    id: string
    name: string
    root: number
    scale: ScaleName
    strength: number
    bypass: boolean
    volume: number
    muted: boolean
}

type Clock = {
    bar: number
    left: number
    progress: number
    playing: boolean
    recordId: string | null
    overdub: boolean
}

const DEFAULTS: Track[] = [
    { id: 'vocals', name: 'Vocals', root: 0, scale: 'Major', strength: 75, bypass: false, volume: 80, muted: false },
    { id: 'harmony', name: 'Harmony', root: 0, scale: 'Major', strength: 90, bypass: false, volume: 75, muted: false },
    { id: 'beatbox', name: 'Beatbox', root: 0, scale: 'Major', strength: 0, bypass: false, volume: 85, muted: false },
    { id: 'bass', name: 'Bass', root: 0, scale: 'Major', strength: 55, bypass: false, volume: 80, muted: false },
]

function tuneOf(track: Track): TuneSettings {
    return { root: track.root, scale: track.scale, strength: track.strength, bypass: track.bypass }
}

export default function VoiceLooper(): JSX.Element {
    const { otherName } = useAppContext()
    const [tracks, setTracks] = useState<Track[]>(DEFAULTS)
    const [bpm, setBpm] = useState(96)
    const [bars, setBars] = useState(8)
    const [clock, setClock] = useState<Clock>({ bar: 1, left: 20, progress: 0, playing: false, recordId: null, overdub: false })
    const [audio, setAudio] = useState<Record<string, boolean>>({})
    const [sheetId, setSheetId] = useState<string | null>(null)
    const [editing, setEditing] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const engineRef = useRef<LoopEngine | null>(null)
    const tracksRef = useRef(tracks)
    const suppress = useRef(false)
    const selfId = useRef(Math.random().toString(36).slice(2, 10))
    tracksRef.current = tracks

    function engine(): LoopEngine {
        if (engineRef.current == null) {
            engineRef.current = new LoopEngine(() => {
                const current = engineRef.current
                if (current == null) return
                const flags: Record<string, boolean> = {}
                tracksRef.current.forEach((track) => {
                    flags[track.id] = current.hasAudio(track.id)
                })
                setAudio(flags)
                setClock(current.position())
            })
        }
        return engineRef.current
    }

    useEffect(() => {
        const loop = engine()
        let frame = 0
        let last = ''
        const tick = (): void => {
            const pos = loop.position()
            const key = (pos.playing ? '1' : '0') + '|' + (pos.recordId || '') + '|' + pos.bar.toFixed(1)
            if (key !== last) {
                last = key
                setClock(pos)
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
            })),
        })
        tracks.forEach((track) => engine().setGain(track.id, track.volume, track.muted))
    }, [tracks])

    const sheet = tracks.find((track) => track.id === sheetId) || null
    const peer = otherName.trim().length > 0 ? otherName.trim() : '…'

    async function onPlay(): Promise<void> {
        setError(null)
        try {
            if (clock.playing) engine().stop()
            else await engine().play()
            setClock(engine().position())
        } catch (err) {
            setError(messageFrom(err))
        }
    }

    function onStop(): void {
        engine().stop()
        setClock(engine().position())
    }

    function onBars(): void {
        const index = BAR_CHOICES.indexOf(bars)
        const next = BAR_CHOICES[(index + 1) % BAR_CHOICES.length]
        engine().setTempo(bpm, next)
        setBars(next)
        setAudio({})
    }

    function onBpm(value: string): void {
        const next = Number(value)
        if (!Number.isFinite(next)) return
        const rounded = Math.max(40, Math.min(200, Math.round(next)))
        if (rounded === bpm) return
        engine().setTempo(rounded, bars)
        setBpm(rounded)
        setAudio({})
    }

    async function onRecord(track: Track, overdub: boolean): Promise<void> {
        setError(null)
        if (clock.recordId === track.id) {
            engine().cancelRecord()
            setClock(engine().position())
            return
        }
        try {
            await engine().record(track.id, overdub, tuneOf(track))
            setClock(engine().position())
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
        setTracks((current) => current.concat([{
            id,
            name: 'Track ' + (current.length + 1),
            root: 0,
            scale: 'Major',
            strength: 70,
            bypass: false,
            volume: 80,
            muted: false,
        }]))
    }

    function removeTrack(id: string): void {
        engine().removeTrack(id)
        setTracks((current) => current.filter((track) => track.id !== id))
        if (sheetId === id) setSheetId(null)
    }

    return <Root>
        <Header>
            <Title>Voice Looper</Title>
            <Subtitle>On a call with {peer} · {bars} bars · {bpm} BPM</Subtitle>
            <Transport>
                <Round type="button" id="VoiceLooperStop" aria-label="Stop" onClick={onStop}><Square /></Round>
                <Play type="button" id="VoiceLooperPlay" aria-label={clock.playing ? 'Pause' : 'Play'} onClick={onPlay}>
                    {clock.playing ? <Pause /> : <Triangle />}
                </Play>
                <Pill type="button" id="VoiceLooperBars" onClick={onBars}>{bars} bars</Pill>
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
                <ProgressFill style={{ width: (clock.progress * 100) + '%' }} />
            </ProgressTrack>
            <ProgressMeta>
                <span>Bar {clock.bar.toFixed(1)}</span>
                <span>{clock.left.toFixed(1)}s</span>
            </ProgressMeta>
            {error != null && <ErrorText role="alert">{error}</ErrorText>}
        </Header>
        <List>
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
                        <Chip type="button" onClick={() => setSheetId(track.id)}>{keyLabel(track.root, track.scale)}</Chip>
                        <Chip type="button" onClick={() => setSheetId(track.id)}>{track.bypass ? 'off' : track.strength + '%'}</Chip>
                    </RowLine>
                    <RowLine>
                        <Tiny
                            type="button"
                            $hot={recording && !clock.overdub}
                            aria-label={'Record ' + track.name}
                            onClick={() => onRecord(track, false)}
                        >Rec</Tiny>
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
                    {sheet.bypass ? 'Bypass on' : 'Bypass'}
                </Chip>
            </Sheet>
        </SheetBackdrop>}
    </Root>
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
    return {
        id: typeof track.id === 'string' ? track.id.slice(0, 40) : 'track',
        name: typeof track.name === 'string' ? track.name.slice(0, 24) : 'Track',
        root: clampIndex(track.root),
        scale: isScale(track.scale) ? track.scale : 'Major',
        strength: clampPercent(track.strength, 70),
        bypass: Boolean(track.bypass),
        volume: clampPercent(track.volume, 80),
        muted: Boolean(track.muted),
    }
}

const raised = '0.22rem 0.22rem 0.45rem rgb(195 193 198 / 90%), -0.12rem -0.12rem 0.35rem #fff'
const inset = 'inset 0.15rem 0.15rem 0.35rem rgb(195 193 198 / 90%), inset -0.1rem -0.1rem 0.3rem #fff'

const Root = styled.div`
    position: absolute;
    inset: 0;
    overflow: auto;
    background: #DFE5EC;
    color: #243038;
    touch-action: manipulation;
`

const Header = styled.header`
    padding: calc(18px + env(safe-area-inset-top)) 16px 8px;
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
    display: inline-flex;
    align-items: center;
    justify-content: center;
`

const Play = styled(Round)`
    width: 72px;
    height: 72px;
    background: #2f7a45;
    color: white;
`

const Pill = styled.button`
    border: 0;
    border-radius: 999px;
    background: #e0e5ec;
    box-shadow: ${raised};
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

const ErrorText = styled.p`
    margin: 8px 0 0;
    color: #9d1c1c;
    font-size: 14px;
`

const List = styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 8px 16px 150px;
`

const Row = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    border-radius: 18px;
    background: #e7eef3;
    box-shadow: ${raised};
`

const RowLine = styled.div`
    display: flex;
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
    background: #e0e5ec;
    box-shadow: ${p => p.$on ? inset : raised};
    color: #243038;
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

function Pencil(): JSX.Element {
    return <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 10.5 L8.8 3.7 L10.3 5.2 L3.5 12 H2 Z M9.4 3.1 L10.5 2 L12 3.5 L10.9 4.6 Z" fill="currentColor" /></svg>
}
