import React, { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import { clearDataEvent, emitDataEvent, onDataEvent } from '../../connection/dataConn'
import { mountWorld, Pose, WorldHandle, WorldInput } from './world'

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
        lookX: 0,
        lookY: 0,
    })
    const camPointer = useRef<number>(null)
    const lastPointer = useRef({ x: 0, y: 0 })
    const [ready, setReady] = useState(false)
    const [hint, setHint] = useState(true)
    const touch = useTouchControls()

    useEffect(() => {
        const canvas = canvasRef.current
        const world = canvas == null ? null : mountWorld(canvas, inputRef.current, () => setReady(true))
        worldRef.current = world
        return () => {
            if (world != null) world.dispose()
            worldRef.current = null
        }
    }, [])

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

    return <Root
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(event) => event.preventDefault()}
    >
        <Canvas ref={canvasRef} />
        {!ready && <Loading>Opening the meadow…</Loading>}
        {!touch && hint && <Hint>WASD to move · Shift to run · Space to jump · drag to look</Hint>}
        {touch && <Joystick input={inputRef.current} />}
        {touch && <JumpButton input={inputRef.current} />}
    </Root>
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
