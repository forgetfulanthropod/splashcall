import React, { PointerEvent as ReactPointerEvent, useEffect, useRef } from 'react'
import styled, { keyframes } from 'styled-components'
import { CreatedCard, ObjectPart } from './types'

const wiggle = keyframes`
    0% { transform: rotate(-2.2deg); }
    50% { transform: rotate(2.2deg); }
    100% { transform: rotate(-2.2deg); }
`

const Tile = styled.div<{ $selected: boolean, $wiggling: boolean, $delay: number }>`
    position: relative;
    flex: 0 0 auto;
    margin: 8px;
    width: 60px;
    height: 120px;
    box-sizing: content-box;
    padding: 8px;
    border-radius: 3px;
    background: #e7eef3;
    touch-action: pan-x;
    box-shadow: 0.3rem 0.3rem 0.5rem rgb(195 193 198 / 90%), -0.2rem -0.2rem 0.4rem #fff;
    animation-duration: 0.22s;
    animation-timing-function: ease-in-out;
    animation-iteration-count: infinite;
    animation-name: ${p => p.$wiggling ? wiggle : 'none'};
    animation-delay: ${p => p.$delay}s;
    ${p => p.$selected && 'box-shadow: inset 0.2rem 0.2rem 0.5rem rgb(195 193 198 / 90%), inset -0.2rem -0.2rem 0.5rem #fff;'}
`

const Face = styled.div`
    width: 60px;
    height: 120px;
    border-radius: 2px;
    overflow: hidden;
    position: relative;
`

const Badge = styled.button`
    position: absolute;
    top: 2px;
    left: 2px;
    z-index: 3;
    width: 22px;
    height: 22px;
    padding: 0;
    border-radius: 50%;
    border: 1.5px solid #fff;
    background: #ff3b30;
    color: #fff;
    font: 700 15px/18px -apple-system, BlinkMacSystemFont, sans-serif;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
    cursor: pointer;
`

const Confirm = styled.div`
    position: absolute;
    inset: 8px;
    z-index: 4;
    border-radius: 3px;
    background: rgba(20, 20, 24, 0.9);
    color: #fff;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 12px;
`

const ConfirmButton = styled.button`
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    color: #fff;
    background: #ff3b30;
    border: 0;
    border-radius: 999px;
    padding: 4px 10px;
    cursor: pointer;
`

const GameFace = styled.div`
    height: 100%;
    box-sizing: border-box;
    padding: 6px;
    background: #1c2430;
    color: #fff;
`

const GameLabel = styled.div`
    font-size: 9px;
    letter-spacing: 0.08em;
    opacity: 0.7;
`

const GameTitle = styled.div`
    margin-top: 8px;
    font-size: 12px;
    line-height: 1.25;
    font-weight: 650;
`

function miniStyle(part: ObjectPart): React.CSSProperties {
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
    else if (part.shape === 'triangle') style.clipPath = 'polygon(50% 0, 100% 100%, 0 100%)'
    return style
}

type Props = {
    card: CreatedCard
    selected: boolean
    wiggling: boolean
    confirming: boolean
    delay: number
    onOpen: () => void
    onLongPress: () => void
    onArmDelete: () => void
    onConfirmDelete: () => void
}

export default function CreatedThumb(props: Props): JSX.Element {
    const timer = useRef<number | null>(null)
    const suppress = useRef(false)
    const start = useRef<{ x: number, y: number } | null>(null)

    function clearTimer(): void {
        if (timer.current != null) {
            window.clearTimeout(timer.current)
            timer.current = null
        }
    }

    useEffect(() => clearTimer, [])

    function beginHold(event: ReactPointerEvent<HTMLDivElement>): void {
        const target = event.target
        if (target instanceof Element && target.closest('[data-delete]') != null) return
        if (event.currentTarget.hasPointerCapture(event.pointerId) === false) {
            try { event.currentTarget.setPointerCapture(event.pointerId) } catch (err) { /* already gone */ }
        }
        start.current = { x: event.clientX, y: event.clientY }
        clearTimer()
        timer.current = window.setTimeout(function () {
            suppress.current = true
            props.onLongPress()
        }, 450)
    }

    function onPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
        if (start.current == null) return
        const dx = event.clientX - start.current.x
        const dy = event.clientY - start.current.y
        if (dx * dx + dy * dy > 24 * 24) clearTimer()
    }

    function onPointerUp(): void {
        clearTimer()
        start.current = null
    }

    function onContextMenu(event: React.MouseEvent<HTMLDivElement>): void {
        event.preventDefault()
        suppress.current = true
        props.onLongPress()
    }

    function onClick(): void {
        if (suppress.current) {
            suppress.current = false
            return
        }
        if (props.wiggling) return
        props.onOpen()
    }

    function onBadge(event: React.MouseEvent<HTMLButtonElement>): void {
        event.stopPropagation()
        event.preventDefault()
        props.onArmDelete()
    }

    function onConfirm(event: React.MouseEvent<HTMLButtonElement>): void {
        event.stopPropagation()
        event.preventDefault()
        props.onConfirmDelete()
    }

    return <Tile
        id={props.card.id}
        data-created-card="yes"
        data-kind={props.card.kind}
        data-wiggling={props.wiggling ? 'yes' : 'no'}
        $selected={props.selected}
        $wiggling={props.wiggling}
        $delay={props.delay}
        onPointerDown={beginHold}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onContextMenu={onContextMenu}
        onClick={onClick}
    >
        <Face>
            {props.card.kind === 'game'
                ? <GameFace>
                    <GameLabel>GAME</GameLabel>
                    <GameTitle>{props.card.title}</GameTitle>
                </GameFace>
                : <div style={{ position: 'relative', width: '100%', height: '100%', background: props.card.background }}>
                    {props.card.parts.slice(0, 8).map((part, index) => <span key={index} style={miniStyle(part)} />)}
                </div>}
        </Face>
        {props.wiggling && <Badge type="button" data-delete="yes" aria-label={'Delete ' + props.card.title} onClick={onBadge}>×</Badge>}
        {props.confirming && <Confirm data-delete="yes">
            <span>Delete?</span>
            <ConfirmButton type="button" data-delete="yes" onClick={onConfirm}>Delete</ConfirmButton>
        </Confirm>}
    </Tile>
}
