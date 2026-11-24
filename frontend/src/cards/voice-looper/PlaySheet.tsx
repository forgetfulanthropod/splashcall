import React, { useRef, useState } from 'react'
import styled from 'styled-components'
import { MicLevel } from './engine'
import { Song, SongTrack, formatClock, parseProgression, PRESETS, songSeconds } from './song'
import { barSeconds } from './theory'

const TABS = ['Song', 'Mic', 'Chords', 'Distort', 'Revisions', 'Other'] as const
export type SheetTab = typeof TABS[number]

type Props = {
    song: Song
    tab: SheetTab
    elapsed: number
    level: MicLevel
    error: string | null
    inputTrim: number
    note: string
    onTab: (tab: SheetTab) => void
    onClose: () => void
    onSeek: (seconds: number) => void
    onBars: (bars: number) => void
    onTrack: (id: string, partial: Partial<SongTrack>) => void
    onChords: (text: string) => void
    onBarsEach: (bars: number) => void
    onFollow: (on: boolean) => void
    onMetronomeVolume: (volume: number) => void
    onTrim: (value: number) => void
    onSaveRevision: () => void
    onRestore: (id: string) => void
    onPreview: (id: string) => void
    onRename: (name: string) => void
    onDuplicate: () => void
    onClear: () => void
    onWav: () => void
    onMp4: () => void
    onNew: () => void
    onSwitch: (id: string) => void
    songs: { id: string, name: string, updated: number, bars: number, bpm: number }[]
    waveRef: React.RefObject<HTMLCanvasElement>
}

export default function PlaySheet(props: Props): JSX.Element {
    const { song } = props
    const length = songSeconds(song.bpm, song.songBars)
    const [selected, setSelected] = useState(song.tracks[0] ? song.tracks[0].id : '')
    const track = song.tracks.find((item) => item.id === selected) || song.tracks[0]
    return <Sheet role="dialog" aria-label="Song">
        <Handle type="button" aria-label="Close song tools" onClick={props.onClose} />
        <Tabs>
            {TABS.map((tab) =>
                <Tab key={tab} type="button" $on={props.tab === tab} onClick={() => props.onTab(tab)}>{tab}</Tab>
            )}
        </Tabs>
        {props.tab === 'Song' && track != null && <div>
            <Row>
                <span>{formatClock(props.elapsed)} / {formatClock(length)}</span>
                <button type="button" onClick={() => props.onBars(Math.max(4, song.songBars - 4))}>−</button>
                <button type="button" onClick={() => props.onBars(Math.min(400, song.songBars + 4))}>+</button>
                <button type="button" onClick={() => props.onBars(barsForEight(song.bpm))}>8 min</button>
            </Row>
            <Timeline
                song={song}
                elapsed={props.elapsed}
                onSeek={props.onSeek}
                onTrack={props.onTrack}
                selected={track.id}
                onSelect={setSelected}
            />
            <Field>Before {track.name}</Field>
            <Row>
                <span>Beats</span>
                <Num value={track.preGapBeats} onChange={(value) => props.onTrack(track.id, { preGapBeats: value })} />
                <span>ms</span>
                <Num value={track.preGapMs} max={2000} step={10} onChange={(value) => props.onTrack(track.id, { preGapMs: value })} />
            </Row>
            <Field>After {track.name}</Field>
            <Row>
                <span>Beats</span>
                <Num value={track.postGapBeats} onChange={(value) => props.onTrack(track.id, { postGapBeats: value })} />
                <span>ms</span>
                <Num value={track.postGapMs} max={2000} step={10} onChange={(value) => props.onTrack(track.id, { postGapMs: value })} />
            </Row>
        </div>}
        {props.tab === 'Mic' && <div>
            <Wave ref={props.waveRef} width={640} height={120} />
            <Row>
                <span>RMS {props.level.db.toFixed(0)} dB</span>
                <span>Peak {props.level.peak > 0 ? Math.max(-96, 20 * Math.log(props.level.peak) / Math.LN10).toFixed(0) : -96} dB</span>
                <Clip $on={props.level.clipped}>CLIP</Clip>
            </Row>
            {!props.level.ready && <Hint>Tap Rec, then allow the microphone.</Hint>}
            {props.level.ready && !props.level.hearing && <Hint>Can&apos;t hear you. Move closer or raise the input.</Hint>}
            {props.error != null && <Hint>{props.error}</Hint>}
            <Field>Input {props.inputTrim}%</Field>
            <input aria-label="Input gain" type="range" min={0} max={200} value={props.inputTrim} onChange={(event) => props.onTrim(Number(event.target.value))} />
        </div>}
        {props.tab === 'Chords' && <div>
            <Row>
                {PRESETS.map((preset) =>
                    <Tab key={preset.id} type="button" onClick={() => props.onChords(preset.text)}>{preset.name}</Tab>
                )}
            </Row>
            <Field>Progression</Field>
            <input
                aria-label="Chord progression"
                value={song.chords.map((chord) => chord.label).join(' ')}
                onChange={(event) => props.onChords(event.target.value)}
            />
            <Row>
                {[1, 2, 4].map((bars) =>
                    <Tab key={bars} type="button" $on={song.barsEach === bars} onClick={() => props.onBarsEach(bars)}>{bars} bar{bars > 1 ? 's' : ''}</Tab>
                )}
                <Tab type="button" $on={song.followChords} onClick={() => props.onFollow(!song.followChords)}>{song.followChords ? 'Following' : 'Follow chords'}</Tab>
            </Row>
            <Hint>{song.chords.map((chord) => chord.label).join(' · ') || parseProgression('I V vi IV').map((chord) => chord.label).join(' · ')}</Hint>
        </div>}
        {props.tab === 'Distort' && track != null && <div>
            <Row>
                {song.tracks.map((item) =>
                    <Tab key={item.id} type="button" $on={item.id === track.id} onClick={() => setSelected(item.id)}>{item.name}</Tab>
                )}
            </Row>
            <Field>Mix {Math.round(track.distort.mix * 100)}%</Field>
            <input aria-label="Distortion mix" type="range" min={0} max={100} value={Math.round(track.distort.mix * 100)} onChange={(event) => props.onTrack(track.id, { distort: { ...track.distort, mix: Number(event.target.value) / 100 } })} />
            <Curve
                points={track.distort.points}
                onChange={(points) => props.onTrack(track.id, { distort: { ...track.distort, points } })}
            />
            <Hint>Drag the curve. It follows the loop from left to right.</Hint>
        </div>}
        {props.tab === 'Revisions' && <div>
            <button type="button" onClick={props.onSaveRevision}>Save version</button>
            {song.revisions.length === 0 && <Hint>Versions appear after you record or save.</Hint>}
            {song.revisions.slice().reverse().map((revision) =>
                <Rev key={revision.id}>
                    <div>
                        <strong>{revision.label}</strong>
                        <Hint>{new Date(revision.at).toLocaleString()}</Hint>
                    </div>
                    <button type="button" onClick={() => props.onPreview(revision.id)}>Play</button>
                    <button type="button" onClick={() => props.onRestore(revision.id)}>Restore</button>
                </Rev>
            )}
        </div>}
        {props.tab === 'Other' && <div>
            <Field>Song name</Field>
            <input aria-label="Song name" value={song.name} onChange={(event) => props.onRename(event.target.value)} />
            <Row>
                <button type="button" onClick={props.onDuplicate}>Duplicate</button>
                <button type="button" onClick={props.onNew}>New song</button>
                <button type="button" onClick={props.onWav}>Export WAV</button>
                <button type="button" onClick={props.onMp4}>Download MP4</button>
                <button type="button" onClick={props.onClear}>Clear</button>
            </Row>
            <Field>Click volume {song.metronomeVolume}%</Field>
            <input aria-label="Metronome volume" type="range" min={0} max={100} value={song.metronomeVolume} onChange={(event) => props.onMetronomeVolume(Number(event.target.value))} />
            {props.note !== '' && <Hint>{props.note}</Hint>}
            <Field>Switch song</Field>
            {props.songs.map((item) =>
                <Rev key={item.id}>
                    <button type="button" onClick={() => props.onSwitch(item.id)}>
                        {item.name}{item.id === song.id ? ' · open' : ''}
                    </button>
                    <Hint>{formatClock(songSeconds(item.bpm, item.bars))}</Hint>
                </Rev>
            )}
        </div>}
    </Sheet>
}

function barsForEight(bpm: number): number {
    const bar = 4 * (60 / (bpm > 0 ? bpm : 90))
    return Math.max(4, Math.min(400, Math.ceil((8 * 60) / bar)))
}

function Num(props: { value: number, max?: number, step?: number, onChange: (value: number) => void }): JSX.Element {
    const max = props.max == null ? 16 : props.max
    const step = props.step == null ? 1 : props.step
    return <span>
        <button type="button" onClick={() => props.onChange(Math.max(0, props.value - step))}>−</button>
        {Math.round(props.value)}
        <button type="button" onClick={() => props.onChange(Math.min(max, props.value + step))}>+</button>
    </span>
}

function Timeline(props: {
    song: Song
    elapsed: number
    selected: string
    onSeek: (seconds: number) => void
    onTrack: (id: string, partial: Partial<SongTrack>) => void
    onSelect: (id: string) => void
}): JSX.Element {
    const scroller = useRef<HTMLDivElement | null>(null)
    const cell = 28
    const width = props.song.songBars * cell
    const playX = props.song.songBars > 0 ? (props.elapsed / songSeconds(props.song.bpm, props.song.songBars)) * width : 0
    return <Scroller ref={scroller}>
        <Board style={{ width }}>
            <Playhead style={{ left: playX }} />
            {props.song.tracks.map((track) =>
                <Lane key={track.id} $on={track.id === props.selected} onClick={() => props.onSelect(track.id)}>
                    <LaneName>{track.name}</LaneName>
                    {Array.from({ length: props.song.songBars }, (_item, bar) => {
                        const on = bar >= track.startBar && bar < track.endBar
                        return <Cell
                            key={bar}
                            $on={on}
                            style={{ width: cell }}
                            onPointerDown={(event) => {
                                event.stopPropagation()
                                const next = nudge(track, bar)
                                props.onTrack(track.id, next)
                            }}
                        />
                    })}
                </Lane>
            )}
            <Ruler onClick={(event) => {
                const board = event.currentTarget.parentElement
                if (board == null) return
                const rect = board.getBoundingClientRect()
                const x = event.clientX - rect.left
                const bar = x / cell
                props.onSeek(bar * barSeconds(props.song.bpm))
            }} />
        </Board>
    </Scroller>
}

function nudge(track: SongTrack, bar: number): Partial<SongTrack> {
    if (bar < track.startBar) return { startBar: bar }
    if (bar >= track.endBar) return { endBar: bar + 1 }
    if (bar === track.startBar) return { startBar: Math.min(track.endBar - 1, bar + 1) }
    return { endBar: bar }
}

function Curve(props: { points: { x: number, y: number }[], onChange: (points: { x: number, y: number }[]) => void }): JSX.Element {
    const ref = useRef<SVGSVGElement | null>(null)
    const points = props.points.length >= 2 ? props.points : [{ x: 0, y: 0 }, { x: 1, y: 0 }]
    function at(event: React.PointerEvent, index: number): void {
        const svg = ref.current
        if (svg == null) return
        const rect = svg.getBoundingClientRect()
        const x = index === 0 ? 0 : index === points.length - 1 ? 1 : Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
        const y = Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height))
        const next = points.map((point, i) => i === index ? { x, y } : point)
        props.onChange(next)
    }
    const d = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x * 100} ${(1 - point.y) * 40}`).join(' ')
    return <Svg ref={ref} viewBox="0 0 100 40" aria-label="Distortion curve">
        <path d={d} />
        {points.map((point, index) =>
            <circle key={index} cx={point.x * 100} cy={(1 - point.y) * 40} r={3} onPointerDown={(event) => {
                const move = (ev: PointerEvent) => at(ev as unknown as React.PointerEvent, index)
                const up = () => {
                    window.removeEventListener('pointermove', move)
                    window.removeEventListener('pointerup', up)
                }
                window.addEventListener('pointermove', move)
                window.addEventListener('pointerup', up)
            }} />
        )}
    </Svg>
}

const Sheet = styled.section`
    position: absolute;
    z-index: 35;
    left: 8px;
    right: 120px;
    bottom: calc(146px + env(safe-area-inset-bottom));
    max-height: 58vh;
    overflow: auto;
    padding: 8px 10px 12px;
    border-radius: 16px 16px 0 0;
    background: #DFE5EC;
    box-shadow: 0 -12px 30px rgb(120 130 140 / 28%);
    color: #243038;
`
const Handle = styled.button`
    display: block;
    width: 42px;
    height: 6px;
    margin: 2px auto 8px;
    border: 0;
    border-radius: 99px;
    background: #b7c0c8;
`
const Tabs = styled.div`
    display: flex;
    gap: 6px;
    overflow-x: auto;
    margin-bottom: 8px;
`
const Tab = styled.button<{ $on?: boolean }>`
    border: 0;
    border-radius: 999px;
    background: ${p => p.$on ? '#2f7a45' : '#e0e5ec'};
    color: ${p => p.$on ? 'white' : '#243038'};
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    padding: 6px 8px;
    white-space: nowrap;
`
const Row = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    margin: 6px 0;
    font-size: 13px;
    font-weight: 700;
`
const Field = styled.div`
    margin-top: 8px;
    font-size: 13px;
    font-weight: 700;
`
const Hint = styled.p`
    margin: 6px 0;
    color: #5c6b73;
    font-size: 12px;
`
const Scroller = styled.div`
    overflow-x: auto;
    border-radius: 12px;
    background: #e7edf3;
`
const Board = styled.div`
    position: relative;
    min-height: 120px;
    padding-top: 8px;
`
const Playhead = styled.div`
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: #243038;
`
const Lane = styled.div<{ $on?: boolean }>`
    display: flex;
    align-items: center;
    height: 28px;
    outline: ${p => p.$on ? '2px solid #2f7a45' : 'none'};
`
const LaneName = styled.span`
    position: sticky;
    left: 0;
    width: 64px;
    flex: 0 0 64px;
    font-size: 11px;
    font-weight: 700;
    background: #e7edf3;
`
const Cell = styled.button<{ $on?: boolean }>`
    height: 18px;
    border: 0;
    border-right: 1px solid #d5dbe3;
    background: ${p => p.$on ? '#2f7a45' : 'transparent'};
    padding: 0;
`
const Ruler = styled.div`
    height: 18px;
`
const Wave = styled.canvas`
    width: 100%;
    height: 84px;
    border-radius: 12px;
    background: #e7edf3;
`
const Clip = styled.span<{ $on?: boolean }>`
    padding: 2px 8px;
    border-radius: 99px;
    background: ${p => p.$on ? '#b42318' : '#d5dbe3'};
    color: ${p => p.$on ? 'white' : '#6b7780'};
`
const Svg = styled.svg`
    width: 100%;
    height: 90px;
    background: #e7edf3;
    border-radius: 12px;
    touch-action: none;
    path { fill: none; stroke: #2f7a45; stroke-width: 1.5; }
    circle { fill: #243038; }
`
const Rev = styled.div`
    display: flex;
    gap: 6px;
    align-items: center;
    justify-content: space-between;
    margin: 6px 0;
`
