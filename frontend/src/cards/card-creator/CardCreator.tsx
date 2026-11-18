import React, { FormEvent, PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react'
import styled, { keyframes } from 'styled-components'
import { sleep } from '../../utils'
import { imagine } from './api'
import { addCreatedCard, cardFromCreation, removeCreatedCard, setActiveCreated, useCreatedState } from './store'
import { CreatedCard, ObjectPart } from './types'

const wiggle = keyframes`
    0% { transform: rotate(-1.6deg); }
    50% { transform: rotate(1.6deg); }
    100% { transform: rotate(-1.6deg); }
`

const Root = styled.div`
    position: absolute;
    inset: 0;
    background: #DFE5EC;
    color: #1d2430;
    overflow: auto;
    touch-action: manipulation;
`

const Sheet = styled.div`
    box-sizing: border-box;
    min-height: 100%;
    padding: calc(28px + env(safe-area-inset-top)) 16px 140px;
    display: flex;
    flex-direction: column;
    gap: 14px;
`

const Title = styled.h1`
    margin: 0;
    font-size: 15px;
    font-weight: 650;
    letter-spacing: 0;
    color: #666;
`

const Form = styled.form`
    display: flex;
    flex-direction: column;
    gap: 12px;
`

const Input = styled.input`
    font: inherit;
    font-size: 17px;
    padding: 14px 16px;
    border-radius: 999px;
    border: 0;
    background: #e0e5ec;
    color: #1d2430;
    box-shadow: inset 0.2rem 0.2rem 0.4rem rgb(195 193 198 / 90%), inset -0.15rem -0.15rem 0.35rem #fff;
    user-select: text;
    -webkit-user-select: text;
    touch-action: manipulation;
    &::placeholder { color: #7d8b99; }
    &:disabled { opacity: 0.7; }
`

const Button = styled.button`
    font: inherit;
    font-size: 17px;
    font-weight: 700;
    padding: 12px 18px;
    border-radius: 999px;
    border: 0;
    background: #e0e5ec;
    color: #1d2430;
    box-shadow: 0.25rem 0.25rem 0.5rem rgb(195 193 198 / 90%), -0.15rem -0.15rem 0.4rem #fff;
    cursor: pointer;
    &:disabled { cursor: default; opacity: 0.6; }
`

const Status = styled.p`
    margin: 0;
    font-size: 15px;
    line-height: 1.4;
    color: #445;
`

const ErrorText = styled(Status)`
    color: #9d1c1c;
`

const GalleryHead = styled.h2`
    margin: 6px 0 0;
    font-size: 13px;
    font-weight: 650;
    color: #666;
`

const Empty = styled.p`
    margin: 0;
    font-size: 14px;
    color: #667;
`

const Grid = styled.div`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
`

const Tile = styled.button<{ $wiggling: boolean, $delay: number }>`
    position: relative;
    display: block;
    width: 100%;
    margin: 0;
    padding: 10px 10px 12px;
    border: 0;
    border-radius: 18px;
    background: #e0e5ec;
    color: #1d2430;
    text-align: left;
    box-shadow: 0.28rem 0.28rem 0.5rem rgb(195 193 198 / 90%), -0.16rem -0.16rem 0.4rem #fff;
    animation-duration: 0.22s;
    animation-timing-function: ease-in-out;
    animation-iteration-count: infinite;
    animation-name: ${p => p.$wiggling ? wiggle : 'none'};
    animation-delay: ${p => p.$delay}s;
    touch-action: manipulation;
`

const Thumb = styled.div`
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    border-radius: 12px;
    overflow: hidden;
`

const Name = styled.div`
    margin-top: 8px;
    font-size: 14px;
    font-weight: 700;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`

const When = styled.div`
    margin-top: 2px;
    font-size: 12px;
    color: #667;
`

const Badge = styled.span`
    position: absolute;
    top: 4px;
    left: 4px;
    z-index: 3;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #ff3b30;
    color: #fff;
    font: 700 16px/22px -apple-system, BlinkMacSystemFont, sans-serif;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
`

const Confirm = styled.div`
    position: absolute;
    inset: 10px;
    z-index: 4;
    border-radius: 14px;
    background: rgba(20, 20, 24, 0.9);
    color: #fff;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 13px;
`

const ConfirmButton = styled.span`
    font-size: 13px;
    font-weight: 700;
    background: #ff3b30;
    border-radius: 999px;
    padding: 4px 10px;
`

const GameFace = styled.div`
    height: 100%;
    box-sizing: border-box;
    padding: 8px;
    background: #1c2430;
    color: #fff;
`

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
    else if (part.shape === 'roundRect') style.borderRadius = '18%'
    else if (part.shape === 'triangle') style.clipPath = 'polygon(50% 0, 100% 100%, 0 100%)'
    return style
}

function formatWhen(stamp: number): string {
    try {
        return new Date(stamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    } catch (err) {
        return ''
    }
}

export default function CardCreator(): JSX.Element {
    const created = useCreatedState()
    const [idea, setIdea] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [wiggling, setWiggling] = useState(false)
    const [confirmId, setConfirmId] = useState<string | null>(null)
    const request = useRef(0)

    useEffect(() => function () { request.current += 1 }, [])

    useEffect(() => {
        if (!wiggling) return undefined
        function onPointerDown(event: PointerEvent): void {
            const target = event.target
            if (target instanceof Element && target.closest('[data-gallery-card]') != null) return
            setWiggling(false)
            setConfirmId(null)
        }
        document.addEventListener('pointerdown', onPointerDown, true)
        return function () { document.removeEventListener('pointerdown', onPointerDown, true) }
    }, [wiggling])

    async function onSubmit(event: FormEvent): Promise<void> {
        event.preventDefault()
        const trimmed = idea.trim()
        if (trimmed.length === 0 || loading) return
        const mine = request.current + 1
        request.current = mine
        setLoading(true)
        setError(null)
        const started = Date.now()
        try {
            const creation = await imagine(trimmed)
            const wait = 400 - (Date.now() - started)
            if (wait > 0) await sleep(wait)
            if (mine !== request.current) return
            const saved = addCreatedCard(cardFromCreation(creation))
            if (!saved) {
                setError('There is not enough room on this phone for another toy. Delete one and try again.')
                return
            }
            setIdea('')
        } catch (err) {
            if (mine !== request.current) return
            const message = err instanceof Error && err.message.length > 0
                ? err.message
                : 'The creator could not finish that. Try again.'
            setError(message)
        } finally {
            if (mine === request.current) setLoading(false)
        }
    }

    const cards = created.cards.slice().reverse()

    return <Root>
        <Sheet>
            <Title>Card Creator</Title>
            <Form onSubmit={onSubmit} aria-busy={loading}>
                <Input
                    id="CardCreatorInput"
                    aria-label="Imagine something new"
                    placeholder="Imagine something new"
                    value={idea}
                    maxLength={400}
                    disabled={loading}
                    autoComplete="off"
                    enterKeyHint="done"
                    onChange={event => setIdea(event.target.value)}
                />
                <Button id="CardCreatorButton" type="submit" disabled={loading || idea.trim().length === 0}>
                    {loading ? 'Imagining…' : 'Create'}
                </Button>
            </Form>
            {loading && <Status id="CardCreatorLoading">Imagining it, then painting the picture…</Status>}
            {error != null && <ErrorText id="CardCreatorError" role="alert">{error}</ErrorText>}
            <GalleryHead>Yours</GalleryHead>
            {cards.length === 0
                ? <Empty>Nothing saved yet. A practice toy still shows up here.</Empty>
                : <Grid>
                    {cards.map((card, index) =>
                        <GalleryCard
                            key={card.id}
                            card={card}
                            delay={index * 0.04}
                            wiggling={wiggling}
                            confirming={confirmId === card.id}
                            onOpen={() => {
                                if (wiggling) return
                                setActiveCreated(card.id)
                            }}
                            onLongPress={() => {
                                setWiggling(true)
                                setConfirmId(null)
                            }}
                            onConfirmDelete={() => {
                                removeCreatedCard(card.id)
                                setConfirmId(null)
                            }}
                        />
                    )}
                </Grid>}
        </Sheet>
    </Root>
}

function GalleryCard(props: {
    card: CreatedCard
    delay: number
    wiggling: boolean
    confirming: boolean
    onOpen: () => void
    onLongPress: () => void
    onConfirmDelete: () => void
}): JSX.Element {
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

    function beginHold(event: ReactPointerEvent<HTMLButtonElement>): void {
        const target = event.target
        if (target instanceof Element && target.closest('[data-delete]') != null) return
        start.current = { x: event.clientX, y: event.clientY }
        clearTimer()
        timer.current = window.setTimeout(function () {
            suppress.current = true
            props.onLongPress()
        }, 450)
    }

    function onPointerMove(event: ReactPointerEvent<HTMLButtonElement>): void {
        if (start.current == null) return
        const dx = event.clientX - start.current.x
        const dy = event.clientY - start.current.y
        if (dx * dx + dy * dy > 24 * 24) clearTimer()
    }

    function onPointerUp(): void {
        clearTimer()
        start.current = null
    }

    function onClick(): void {
        if (suppress.current) {
            suppress.current = false
            return
        }
        props.onOpen()
    }

    return <Tile
        type="button"
        id={props.card.id}
        data-gallery-card="yes"
        $wiggling={props.wiggling}
        $delay={props.delay}
        onPointerDown={beginHold}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(event) => {
            event.preventDefault()
            suppress.current = true
            props.onLongPress()
        }}
        onClick={onClick}
    >
        <Thumb>
            {props.card.image
                ? <img src={props.card.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : props.card.kind === 'game'
                    ? <GameFace>{props.card.title}</GameFace>
                    : <div style={{ position: 'relative', width: '100%', height: '100%', background: props.card.background }}>
                        {props.card.parts.slice(0, 8).map((part, index) => <span key={index} style={partStyle(part)} />)}
                    </div>}
            <Badge
                data-delete="yes"
                aria-label={'Delete ' + props.card.title}
                onClick={(event) => {
                    event.stopPropagation()
                    event.preventDefault()
                    props.onConfirmDelete()
                }}
            >×</Badge>
        </Thumb>
        <Name>{props.card.title}</Name>
        <When>{formatWhen(props.card.createdAt)}</When>
        {props.confirming && <Confirm data-delete="yes">
            <span>Delete?</span>
            <ConfirmButton
                data-delete="yes"
                onClick={(event) => {
                    event.stopPropagation()
                    event.preventDefault()
                    props.onConfirmDelete()
                }}
            >Delete</ConfirmButton>
        </Confirm>}
    </Tile>
}
