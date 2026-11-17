import React, { FormEvent, useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import { clearDataEvent, emitDataEvent, onDataEvent } from '../../connection/dataConn'
import { imagineWorld } from './api'
import { assetStoreBytes, formatBytes, listWorldSaves, loadWorldSave, rememberWorld, removeWorldSave, writeWorldSave } from './saves'
import { Placement, practiceWorlds, WorldSpec } from './spec'
import { mountWorld, PlayerState, Pose, WorldHandle, WorldInput, WorldStatus } from './world'
import { WorldSave } from './asset-store'

const MOVE_CODES = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']

export default function OpenWorld(): JSX.Element {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const worldRef = useRef<WorldHandle>(null)
    const inputRef = useRef<WorldInput>({
        keyForward: 0,
        keyStrafe: 0,
        keyRun: false,
        joyX: 0,
        joyY: 0,
        jump: false,
        attack: false,
        lookX: 0,
        lookY: 0,
    })
    const camPointer = useRef<number>(null)
    const lastPointer = useRef({ x: 0, y: 0 })
    const [ready, setReady] = useState(false)
    const [hint, setHint] = useState(true)
    const [session, setSession] = useState<Session>(() => ({
        spec: practiceWorlds()[0],
        player: null,
        pixels: null,
        placements: null,
        revision: 0,
    }))
    const [health, setHealth] = useState(100)
    const [maxHealth, setMaxHealth] = useState(100)
    const [respawned, setRespawned] = useState(false)
    const [idea, setIdea] = useState('')
    const [imagining, setImagining] = useState(false)
    const [notice, setNotice] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [savesOpen, setSavesOpen] = useState(false)
    const [saves, setSaves] = useState<WorldSave[]>([])
    const [storeBytes, setStoreBytes] = useState(0)
    const [saveError, setSaveError] = useState<string | null>(null)
    const request = useRef(0)
    const touch = useTouchControls()

    useEffect(() => {
        const canvas = canvasRef.current
        if (canvas == null) return undefined
        let alive = true
        setReady(false)
        const world = mountWorld(canvas, inputRef.current, {
            spec: session.spec,
            player: session.player,
            texturePixels: session.pixels,
            placements: session.placements,
            onReady: () => {
                if (alive) setReady(true)
            },
            onStatus: (status: WorldStatus) => {
                if (!alive) return
                setHealth(status.health)
                setMaxHealth(status.maxHealth)
                if (status.respawned) {
                    setRespawned(true)
                    window.setTimeout(() => {
                        if (alive) setRespawned(false)
                    }, 1600)
                }
            },
        })
        worldRef.current = world
        return () => {
            alive = false
            world.dispose()
            worldRef.current = null
        }
    }, [session])

    useEffect(() => {
        if (session.pixels != null) return undefined
        let cancel = false
        rememberWorld(session.spec)
            .then(() => assetStoreBytes())
            .then((bytes) => {
                if (!cancel) setStoreBytes(bytes)
            })
            .catch(() => undefined)
        return () => {
            cancel = true
        }
    }, [session])

    useEffect(() => {
        const selfId = Math.random().toString(36).slice(2, 10)
        onDataEvent('OpenWorld-pose', (incoming) => {
            const pose = asNetPose(incoming)
            if (pose == null || pose.id === selfId) return
            worldRef.current?.setRemote(pose)
        })
        const timer = window.setInterval(() => {
            const pose = worldRef.current?.getPose()
            if (pose == null) return
            emitDataEvent('OpenWorld-pose', { ...pose, id: selfId })
        }, 100)
        return () => {
            window.clearInterval(timer)
            clearDataEvent('OpenWorld-pose')
        }
    }, [])

    useEffect(() => {
        const keys: Record<string, boolean> = {}
        const input = inputRef.current
        function sync(): void {
            const forward = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0)
            const strafe = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0)
            const mag = Math.hypot(forward, strafe)
            input.keyForward = mag > 0 ? forward / mag : 0
            input.keyStrafe = mag > 0 ? strafe / mag : 0
            input.keyRun = Boolean(keys.ShiftLeft || keys.ShiftRight)
        }
        function onKeyDown(event: KeyboardEvent): void {
            const tag = (event.target as HTMLElement | null)?.tagName
            if (tag === 'INPUT' || tag === 'TEXTAREA') return
            if (event.code === 'Space' || MOVE_CODES.indexOf(event.code) >= 0) event.preventDefault()
            if (event.code === 'Space' && !event.repeat) input.jump = true
            if ((event.code === 'KeyF' || event.code === 'KeyJ') && !event.repeat) input.attack = true
            keys[event.code] = true
            sync()
            setHint(false)
        }
        function onKeyUp(event: KeyboardEvent): void {
            keys[event.code] = false
            sync()
        }
        function clear(): void {
            for (const code in keys) keys[code] = false
            sync()
        }
        window.addEventListener('keydown', onKeyDown, true)
        window.addEventListener('keyup', onKeyUp)
        window.addEventListener('blur', clear)
        return () => {
            window.removeEventListener('keydown', onKeyDown, true)
            window.removeEventListener('keyup', onKeyUp)
            window.removeEventListener('blur', clear)
        }
    }, [])

    useEffect(() => {
        if (!hint || touch) return () => undefined
        const timer = window.setTimeout(() => setHint(false), 6500)
        return () => window.clearTimeout(timer)
    }, [hint, touch])

    function onPointerDown(event: React.PointerEvent<HTMLDivElement>): void {
        if (event.button !== 0) return
        if (isControl(event.target)) return
        if (camPointer.current != null) return
        camPointer.current = event.pointerId
        lastPointer.current = { x: event.clientX, y: event.clientY }
        event.currentTarget.setPointerCapture(event.pointerId)
        setHint(false)
    }

    function onPointerMove(event: React.PointerEvent<HTMLDivElement>): void {
        if (event.pointerId !== camPointer.current) return
        const dx = event.clientX - lastPointer.current.x
        const dy = event.clientY - lastPointer.current.y
        lastPointer.current = { x: event.clientX, y: event.clientY }
        inputRef.current.lookX += dx * 0.005
        inputRef.current.lookY += -dy * 0.0035
    }

    function onPointerUp(event: React.PointerEvent<HTMLDivElement>): void {
        if (event.pointerId !== camPointer.current) return
        camPointer.current = null
    }

    function showWorld(spec: WorldSpec, player: PlayerState | null, pixels: Uint8Array | null, placements: Placement[] | null): void {
        setHealth(player == null ? 100 : player.health)
        setRespawned(false)
        setError(null)
        setSession(current => ({
            spec,
            player,
            pixels,
            placements,
            revision: current.revision + 1,
        }))
    }

    function openPractice(spec: WorldSpec): void {
        setNotice('Practice world. It works with no server.')
        showWorld(spec, null, null, null)
    }

    async function onImagine(event: FormEvent): Promise<void> {
        event.preventDefault()
        const trimmed = idea.trim()
        if (trimmed.length === 0 || imagining) return
        const mine = request.current + 1
        request.current = mine
        setImagining(true)
        setError(null)
        try {
            const result = await imagineWorld(trimmed)
            if (mine !== request.current) return
            setNotice(result.offline
                ? 'Practice world. The creator is offline.'
                : result.mock
                    ? 'Practice world. No creator key is set on the server.'
                    : result.world.name)
            showWorld(result.world, null, null, null)
            setIdea('')
        } catch (err) {
            if (mine !== request.current) return
            const message = err instanceof Error && err.message.length > 0
                ? err.message
                : 'The creator could not finish that world. Try again.'
            setError(message)
        } finally {
            if (mine === request.current) setImagining(false)
        }
    }

    async function refreshSaves(): Promise<void> {
        const [next, bytes] = await Promise.all([listWorldSaves(), assetStoreBytes()])
        setSaves(next)
        setStoreBytes(bytes)
    }

    async function toggleSaves(): Promise<void> {
        const next = !savesOpen
        setSavesOpen(next)
        if (!next) return
        try {
            await refreshSaves()
            setSaveError(null)
        } catch (err) {
            setSaveError('This browser blocked local saves.')
        }
    }

    async function onSave(): Promise<void> {
        const player = worldRef.current?.getPlayerState()
        if (player == null) return
        try {
            await writeWorldSave(session.spec, player)
            await refreshSaves()
            setSavesOpen(true)
            setSaveError(null)
            setNotice('Saved on this device.')
        } catch (err) {
            setSavesOpen(true)
            setSaveError('This browser blocked local saves.')
        }
    }

    async function onLoad(save: WorldSave): Promise<void> {
        try {
            const loaded = await loadWorldSave(save)
            setNotice(loaded.spec.name)
            showWorld(loaded.spec, loaded.player, loaded.pixels, loaded.placements)
            setSavesOpen(false)
            setSaveError(null)
        } catch (err) {
            const message = err instanceof Error && err.message.length > 0
                ? err.message
                : 'That save could not be opened.'
            setSaveError(message)
        }
    }

    async function onDelete(id: string): Promise<void> {
        await removeWorldSave(id)
        await refreshSaves()
    }

    return <Root
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(event) => event.preventDefault()}
    >
        <Canvas key={session.revision} ref={canvasRef} />
        {!ready && <Loading>Opening {session.spec.name}…</Loading>}
        <Hud data-control="hud">
            <Prompt onSubmit={onImagine}>
                <PromptInput
                    aria-label="What world do you imagine?"
                    placeholder="What world do you imagine?"
                    value={idea}
                    maxLength={400}
                    disabled={imagining}
                    autoComplete="off"
                    enterKeyHint="done"
                    onChange={event => setIdea(event.target.value)}
                    onPointerDown={stopHud}
                />
                <PromptButton type="submit" disabled={imagining || idea.trim().length === 0}>
                    {imagining ? 'Imagining…' : 'Imagine'}
                </PromptButton>
            </Prompt>
            <Practice>
                {practiceWorlds().map(world =>
                    <Chip key={world.name} type="button" onPointerDown={stopHud} onClick={() => openPractice(world)}>
                        {world.name}
                    </Chip>
                )}
                <Chip type="button" onPointerDown={stopHud} onClick={onSave} disabled={!ready}>Save</Chip>
                <Chip type="button" onPointerDown={stopHud} onClick={toggleSaves}>Saves</Chip>
            </Practice>
            <HealthRow>
                <HealthLabel>Health {health}</HealthLabel>
                <HealthTrack aria-label={`Health ${health}`}>
                    <HealthFill style={{ width: `${Math.max(0, Math.round(health / maxHealth * 100))}%` }} />
                </HealthTrack>
            </HealthRow>
            {notice != null && <Note>{notice}</Note>}
            {error != null && <Problem role="alert">{error}</Problem>}
            {respawned && <Note>You respawned.</Note>}
            {savesOpen && <SaveList
                saves={saves}
                bytes={storeBytes}
                error={saveError}
                onLoad={onLoad}
                onDelete={onDelete}
            />}
        </Hud>
        {!touch && hint && <Hint>WASD to move · Shift to run · Space to jump · F to attack · drag to look</Hint>}
        {touch && <Joystick input={inputRef.current} />}
        <AttackButton input={inputRef.current} touch={touch} />
        {touch && <JumpButton input={inputRef.current} />}
    </Root>
}

type Session = {
    spec: WorldSpec
    player: PlayerState | null
    pixels: Uint8Array | null
    placements: Placement[] | null
    revision: number
}

function stopHud(event: React.PointerEvent): void {
    event.stopPropagation()
}

function Joystick({ input }: { input: WorldInput }): JSX.Element {
    const baseRef = useRef<HTMLDivElement>(null)
    const knobRef = useRef<HTMLDivElement>(null)
    const pointerId = useRef<number>(null)
    const max = 42

    function place(event: React.PointerEvent): void {
        const rect = baseRef.current?.getBoundingClientRect()
        if (rect == null) return
        let x = event.clientX - (rect.left + rect.width / 2)
        let y = event.clientY - (rect.top + rect.height / 2)
        const dist = Math.hypot(x, y)
        if (dist > max) {
            x = x / dist * max
            y = y / dist * max
        }
        input.joyX = x / max
        input.joyY = -y / max
        if (knobRef.current != null) knobRef.current.style.transform = `translate(${x}px, ${y}px)`
    }

    function end(event: React.PointerEvent): void {
        if (event.pointerId !== pointerId.current) return
        pointerId.current = null
        input.joyX = 0
        input.joyY = 0
        if (knobRef.current != null) knobRef.current.style.transform = 'translate(0px, 0px)'
    }

    return <Stick
        data-control="joystick"
        ref={baseRef}
        onPointerDown={(event) => {
            event.stopPropagation()
            pointerId.current = event.pointerId
            event.currentTarget.setPointerCapture(event.pointerId)
            place(event)
        }}
        onPointerMove={(event) => {
            if (event.pointerId !== pointerId.current) return
            event.stopPropagation()
            place(event)
        }}
        onPointerUp={end}
        onPointerCancel={end}
    >
        <Knob ref={knobRef} />
    </Stick>
}

function AttackButton({ input, touch }: { input: WorldInput, touch: boolean }): JSX.Element {
    return <Attack
        type="button"
        data-control="attack"
        aria-label="Attack"
        $touch={touch}
        onPointerDown={(event) => {
            event.stopPropagation()
            event.preventDefault()
            input.attack = true
        }}
    >
        Attack
    </Attack>
}

function SaveList({
    saves,
    bytes,
    error,
    onLoad,
    onDelete,
}: {
    saves: WorldSave[]
    bytes: number
    error: string | null
    onLoad: (save: WorldSave) => void
    onDelete: (id: string) => void
}): JSX.Element {
    return <SavesPanel>
        <StoreSize>Asset store {formatBytes(bytes)}</StoreSize>
        {error != null && <Problem role="alert">{error}</Problem>}
        {saves.length === 0 && error == null && <Note>No saves yet. A save keeps the world and where you were standing.</Note>}
        {saves.map(save =>
            <SaveRow key={save.id}>
                <SaveText>
                    <SaveName>{save.name}</SaveName>
                    <SaveWhen>{new Date(save.savedAt).toLocaleString()}</SaveWhen>
                </SaveText>
                <RowButtons>
                    <Chip type="button" onPointerDown={stopHud} onClick={() => onLoad(save)}>Load</Chip>
                    <Chip type="button" onPointerDown={stopHud} onClick={() => onDelete(save.id)}>Delete</Chip>
                </RowButtons>
            </SaveRow>
        )}
    </SavesPanel>
}

function JumpButton({ input }: { input: WorldInput }): JSX.Element {
    return <Jump
        type="button"
        data-control="jump"
        aria-label="Jump"
        onPointerDown={(event) => {
            event.stopPropagation()
            event.preventDefault()
            input.jump = true
        }}
    >
        <Arrow viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5l7 8h-4.2v6h-5.6v-6H5l7-8z" />
        </Arrow>
    </Jump>
}

function useTouchControls(): boolean {
    const [touch, setTouch] = useState(() => wantsTouchControls())
    useEffect(() => {
        const update = () => setTouch(wantsTouchControls())
        const query = window.matchMedia('(pointer: coarse)')
        if (query.addEventListener != null) query.addEventListener('change', update)
        else query.addListener(update)
        window.addEventListener('resize', update)
        return () => {
            if (query.removeEventListener != null) query.removeEventListener('change', update)
            else query.removeListener(update)
            window.removeEventListener('resize', update)
        }
    }, [])
    return touch
}

function wantsTouchControls(): boolean {
    return window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 900
}

function isControl(target: EventTarget): boolean {
    return target instanceof Element && target.closest('[data-control]') != null
}

function asNetPose(data: unknown): (Pose & { id: string }) | null {
    if (data == null || typeof data !== 'object') return null
    const pose = data as Pose & { id?: string }
    if (typeof pose.id !== 'string') return null
    if (typeof pose.x !== 'number' || typeof pose.y !== 'number' || typeof pose.z !== 'number') return null
    if (typeof pose.yaw !== 'number' || typeof pose.anim !== 'number') return null
    return {
        id: pose.id,
        x: pose.x,
        y: pose.y,
        z: pose.z,
        yaw: pose.yaw,
        anim: Math.max(0, Math.min(3, pose.anim | 0)),
    }
}

const Root = styled.div`
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    overflow: hidden;
    touch-action: none;
    background: #8ec8f0;
    user-select: none;
`

const Canvas = styled.canvas`
    width: 100%;
    height: 100%;
    display: block;
    touch-action: none;
`

const Loading = styled.div`
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    padding: 12px 18px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.88);
    color: #24533a;
    font-weight: 650;
    letter-spacing: 0.01em;
    pointer-events: none;
`

const Hud = styled.div`
    position: absolute;
    z-index: 6;
    top: 28px;
    left: 12px;
    right: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 560px;
    pointer-events: none;
`

const Prompt = styled.form`
    display: flex;
    gap: 8px;
    pointer-events: auto;
`

const PromptInput = styled.input`
    flex: 1;
    min-width: 0;
    font: inherit;
    font-size: 15px;
    padding: 10px 12px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.9);
    background: rgba(255, 255, 255, 0.92);
    color: #1d2430;
    user-select: text;
    -webkit-user-select: text;
    &::placeholder { color: #607060; }
`

const PromptButton = styled.button`
    font: inherit;
    font-size: 15px;
    font-weight: 700;
    padding: 10px 14px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.9);
    background: #2f7a45;
    color: white;
    &:disabled { opacity: 0.55; }
`

const Practice = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    pointer-events: auto;
`

const Chip = styled.button`
    font: inherit;
    font-size: 13px;
    font-weight: 650;
    padding: 6px 10px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.85);
    background: rgba(255, 255, 255, 0.88);
    color: #24533a;
    &:disabled { opacity: 0.55; }
`

const HealthRow = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    pointer-events: none;
`

const HealthLabel = styled.div`
    font-size: 13px;
    font-weight: 700;
    color: #163524;
    background: rgba(255, 255, 255, 0.88);
    border-radius: 999px;
    padding: 3px 8px;
`

const HealthTrack = styled.div`
    flex: 1;
    height: 12px;
    border-radius: 999px;
    background: rgba(20, 24, 20, 0.45);
    border: 2px solid rgba(255, 255, 255, 0.85);
    overflow: hidden;
    pointer-events: none;
`

const HealthFill = styled.div`
    height: 100%;
    background: #3ddc6a;
    border-radius: 999px;
`

const Note = styled.p`
    margin: 0;
    font-size: 13px;
    color: #163524;
    background: rgba(255, 255, 255, 0.82);
    border-radius: 10px;
    padding: 6px 10px;
    pointer-events: none;
`

const Problem = styled(Note)`
    color: #9d1c1c;
    pointer-events: auto;
`

const SavesPanel = styled.div`
    pointer-events: auto;
    max-height: 42vh;
    overflow: auto;
    background: rgba(255, 255, 255, 0.94);
    border-radius: 16px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
`

const StoreSize = styled.div`
    font-size: 13px;
    font-weight: 700;
    color: #24533a;
`

const SaveRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
`

const SaveText = styled.div`
    min-width: 0;
`

const SaveName = styled.div`
    font-weight: 700;
    color: #1d2430;
`

const SaveWhen = styled.div`
    font-size: 12px;
    color: #4d5b55;
`

const RowButtons = styled.div`
    display: flex;
    gap: 6px;
    flex-shrink: 0;
`

const Hint = styled.div`
    position: absolute;
    left: 50%;
    bottom: 28px;
    transform: translateX(-50%);
    max-width: calc(100% - 32px);
    padding: 8px 14px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.82);
    color: #24533a;
    font-size: 14px;
    text-align: center;
    pointer-events: none;
`

const Stick = styled.div`
    position: absolute;
    z-index: 5;
    left: 18px;
    bottom: calc(58px + env(safe-area-inset-bottom));
    width: 120px;
    height: 120px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.3);
    border: 2px solid rgba(255, 255, 255, 0.78);
    box-shadow: 0 10px 24px rgba(28, 58, 32, 0.18);
    touch-action: none;
`

const Knob = styled.div`
    position: absolute;
    left: 50%;
    top: 50%;
    width: 54px;
    height: 54px;
    margin-left: -27px;
    margin-top: -27px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.94);
    box-shadow: 0 4px 12px rgba(20, 40, 20, 0.28);
`

const Attack = styled.button<{ $touch: boolean }>`
    position: absolute;
    z-index: 5;
    right: 18px;
    bottom: ${p => p.$touch
        ? 'calc(190px + env(safe-area-inset-bottom))'
        : 'calc(96px + env(safe-area-inset-bottom))'};
    min-width: 76px;
    height: 76px;
    padding: 0 12px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.9);
    background: rgba(198, 72, 48, 0.92);
    box-shadow: 0 10px 22px rgba(28, 58, 32, 0.2);
    color: white;
    font: inherit;
    font-weight: 750;
    touch-action: none;
    &:active { transform: scale(0.94); }
`

const Jump = styled.button`
    position: absolute;
    z-index: 5;
    right: 18px;
    bottom: calc(102px + env(safe-area-inset-bottom));
    width: 76px;
    height: 76px;
    padding: 0;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.9);
    background: rgba(255, 255, 255, 0.9);
    box-shadow: 0 10px 22px rgba(28, 58, 32, 0.2);
    color: #2f7a45;
    touch-action: none;
    &:active {
        transform: scale(0.94);
    }
`

const Arrow = styled.svg`
    width: 34px;
    height: 34px;
    fill: currentColor;
`
