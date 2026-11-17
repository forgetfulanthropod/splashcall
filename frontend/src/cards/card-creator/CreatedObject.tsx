import React, { PointerEvent as ReactPointerEvent, useEffect, useRef } from 'react'
import styled, { keyframes } from 'styled-components'
import { cssColor } from './sandbox'
import { CreatedCard, IdleName, ObjectPart } from './types'

const bob = keyframes`
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-12px); }
`
const sway = keyframes`
    0%, 100% { transform: rotate(-7deg); }
    50% { transform: rotate(7deg); }
`
const breathe = keyframes`
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.06); }
`
const blink = keyframes`
    0%, 42%, 54%, 100% { opacity: 1; }
    48% { opacity: 0.2; }
`

function idleFrames(name: IdleName): typeof bob {
    if (name === 'sway') return sway
    if (name === 'breathe') return breathe
    if (name === 'blink') return blink
    return bob
}

const Stage = styled.div<{ $ink: string }>`
    position: absolute;
    inset: 0;
    overflow: hidden;
    touch-action: none;
    color: ${p => p.$ink};
    user-select: none;
`

const Title = styled.div`
    position: absolute;
    top: 18px;
    left: 16px;
    right: 16px;
    text-align: center;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.02em;
    pointer-events: none;
    text-shadow: 0 1px 0 rgba(255, 255, 255, 0.35);
`

const Hint = styled.div`
    position: absolute;
    top: 52px;
    left: 16px;
    right: 16px;
    text-align: center;
    font-size: 14px;
    opacity: 0.75;
    pointer-events: none;
`

const Body = styled.div`
    position: absolute;
    left: 0;
    top: 0;
    touch-action: none;
    cursor: grab;
    filter: drop-shadow(0 12px 10px rgba(0, 0, 0, 0.22));
    &:active { cursor: grabbing; }
`

const Idle = styled.div<{ $idle: IdleName }>`
    width: 100%;
    height: 100%;
    position: relative;
    transform-origin: center center;
    animation-name: ${p => idleFrames(p.$idle)};
    animation-duration: 2.8s;
    animation-timing-function: ease-in-out;
    animation-iteration-count: infinite;
    &[data-paused='yes'] { animation-play-state: paused; }
`

function inkFor(background: string): string {
    const hex = cssColor(background, '#d7e6f2').slice(1, 7)
    const red = parseInt(hex.slice(0, 2), 16)
    const green = parseInt(hex.slice(2, 4), 16)
    const blue = parseInt(hex.slice(4, 6), 16)
    if (!Number.isFinite(red) || !Number.isFinite(green) || !Number.isFinite(blue)) return '#1d2430'
    const y = (red * 299 + green * 587 + blue * 114) / 1000
    return y > 160 ? '#1d2430' : '#ffffff'
}

function partStyle(part: ObjectPart): React.CSSProperties {
    const style: React.CSSProperties = {
        position: 'absolute',
        left: part.x + '%',
        top: part.y + '%',
        width: part.w + '%',
        height: part.h + '%',
        background: part.color,
        transform: 'translate(-50%, -50%) rotate(' + part.rotation + 'deg)',
    }
    if (part.shape === 'circle' || part.shape === 'ellipse') style.borderRadius = '50%'
    else if (part.shape === 'roundRect') style.borderRadius = '22%'
    else if (part.shape === 'triangle') {
        style.clipPath = 'polygon(50% 0, 100% 100%, 0 100%)'
    }
    return style
}

type Physics = {
    x: number
    y: number
    vx: number
    vy: number
    dragging: boolean
    ready: boolean
    lastX: number
    lastY: number
    lastT: number
}

export default function CreatedObject({ card }: { card: CreatedCard }): JSX.Element {
    const stageRef = useRef<HTMLDivElement>(null)
    const bodyRef = useRef<HTMLDivElement>(null)
    const idleRef = useRef<HTMLDivElement>(null)
    const physics = useRef<Physics>({
        x: 0, y: 0, vx: 0, vy: 0, dragging: false, ready: false, lastX: 0, lastY: 0, lastT: 0,
    })

    useEffect(() => {
        const stage = stageRef.current
        const body = bodyRef.current
        if (stage == null || body == null) return undefined
        const motion = physics.current
        motion.ready = false
        motion.vx = 0
        motion.vy = 0
        let frame = 0

        function radius(width: number, height: number, top: number, bottom: number): number {
            const room = Math.max(48, height - top - bottom)
            return Math.min(room / 2 - 4, Math.max(56, Math.min(width, height) * 0.22))
        }

        function tick(): void {
            const width = stage.clientWidth
            const height = stage.clientHeight
            if (width < 20 || height < 20) {
                frame = requestAnimationFrame(tick)
                return
            }
            const top = 78
            const bottom = Math.min(130, height * 0.22)
            const side = 8
            const r = radius(width, height, top, bottom)
            if (!motion.ready) {
                motion.x = width / 2
                motion.y = Math.min(height * 0.46, height - bottom - r)
                motion.ready = true
            }
            if (!motion.dragging) {
                motion.vy += 0.16
                motion.vx *= 0.985
                motion.vy *= 0.985
                motion.x += motion.vx
                motion.y += motion.vy
                if (motion.x < side + r) {
                    motion.x = side + r
                    motion.vx = Math.abs(motion.vx) * 0.62
                }
                if (motion.x > width - side - r) {
                    motion.x = width - side - r
                    motion.vx = -Math.abs(motion.vx) * 0.62
                }
                if (motion.y < top + r) {
                    motion.y = top + r
                    motion.vy = Math.abs(motion.vy) * 0.62
                }
                if (motion.y > height - bottom - r) {
                    motion.y = height - bottom - r
                    motion.vy = -Math.abs(motion.vy) * 0.55
                }
                if (Math.abs(motion.vx) < 0.04) motion.vx = 0
                if (Math.abs(motion.vy) < 0.04 && motion.y >= height - bottom - r - 0.5) motion.vy = 0
            }
            body.style.width = (r * 2) + 'px'
            body.style.height = (r * 2) + 'px'
            body.style.transform = 'translate(' + (motion.x - r) + 'px, ' + (motion.y - r) + 'px)'
            frame = requestAnimationFrame(tick)
        }

        frame = requestAnimationFrame(tick)
        return function () { cancelAnimationFrame(frame) }
    }, [card.id])

    function onPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
        const body = bodyRef.current
        if (body == null) return
        body.setPointerCapture(event.pointerId)
        const motion = physics.current
        motion.dragging = true
        motion.vx = 0
        motion.vy = 0
        motion.lastX = event.clientX
        motion.lastY = event.clientY
        motion.lastT = performance.now()
        idleRef.current?.setAttribute('data-paused', 'yes')
    }

    function onPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
        const motion = physics.current
        if (!motion.dragging) return
        const now = performance.now()
        const dt = Math.max(8, now - motion.lastT)
        const dx = event.clientX - motion.lastX
        const dy = event.clientY - motion.lastY
        motion.x += dx
        motion.y += dy
        motion.vx = Math.max(-70, Math.min(70, dx / dt * 16))
        motion.vy = Math.max(-70, Math.min(70, dy / dt * 16))
        motion.lastX = event.clientX
        motion.lastY = event.clientY
        motion.lastT = now
    }

    function onPointerUp(): void {
        physics.current.dragging = false
        idleRef.current?.setAttribute('data-paused', 'no')
    }

    return <Stage id="CreatedObject" ref={stageRef} $ink={inkFor(card.background)} style={{ background: card.background }}>
        <Title>{card.title}</Title>
        <Hint>Grab it and toss it</Hint>
        <Body
            ref={bodyRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
        >
            <Idle ref={idleRef} $idle={card.idle}>
                {card.parts.map((part, index) => <div key={index} style={partStyle(part)} />)}
            </Idle>
        </Body>
    </Stage>
}
