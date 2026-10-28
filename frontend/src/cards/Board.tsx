import { useLocalStorageState, useSize, useThrottleFn } from 'ahooks'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useAppContext } from '../context'
import { emitDataEvent, onDataEvent } from '../connection/dataConn'
import { useEffectWhen, useOnRef } from '../hooks'
import { arrayEquals, setAt } from '../utils'
import styles from './Board.module.css'

import { hexToHsv, hsvToHex } from '../lib/colorUtils'

const NETWORK_FRAME_RATE = 15
const transitionStyle = `left ${1 / NETWORK_FRAME_RATE}s ease-in-out, top ${1 / NETWORK_FRAME_RATE}s ease-in-out`

export interface BoardState {
    positions: Coords[]
    isWhite: boolean
}

export type Coords = [number, number]
type Rect = { width: number, height: number }

type BoardEvent =
    { type: 'state', state: BoardState } |
    { type: 'movement', index: number, coords: Coords } |
    { type: 'request' }

type ChangeCoords = (index: number, coords: Coords, isFinal: boolean) => void

interface BoardProps {
    storageName: string
    initialState: BoardState
    colors: [string, string]
    chars: string[]
    fontScale: number
    doubleClickChar?: string,
}
export function Board(props: BoardProps): JSX.Element {
    // TODO: initial connection should be more reliable
    const { storageName } = props
    const [state, setState] = useLocalStorageState(storageName, props.initialState)
    const [hasConnected, setHasConnected] = useState(false)
    const { callerType, isCallConnected, aspect: { screenInfo }, } = useAppContext()
    const divRef = useRef()
    const divSize = useSize(divRef)
    const boardContainerRatio = divSize.width < 350 ? 1 : .9 //for very small screens, use entire thing
    const sideLength = divSize.width == null ? null : Math.floor(Math.min(divSize.width, divSize.height) * boardContainerRatio)
    // DEBUG
    // useEffect(() => { toast(callerType) }, [callerType])

    const emit = useCallback((be: BoardEvent) => emitDataEvent(storageName, be), [storageName])

    const sendAndUpdate = useCallback((newState: BoardState) => {
        setState(newState)
        if (hasConnected) emit({ type: 'state', state: newState })
    }, [setState, hasConnected, emit])


    const changeCoordsUnthrottled: ChangeCoords = useCallback((index, coords, isFinal = false) => {
        const scaled: Coords = [coords[0] / sideLength, coords[1] / sideLength]
        if (isFinal as boolean) {
            setState(state => {
                const newState = { ...state, positions: setAt(state.positions, index, scaled) }
                if (hasConnected) emit({ type: 'state', state: newState })
                return newState
            })
        } else {
            if (hasConnected) emit({ type: 'movement', index, coords: scaled })
        }
    }, [setState, sideLength, hasConnected, emit])
    const changeCoords = useThrottleFn(changeCoordsUnthrottled, { wait: ~~(1000 / NETWORK_FRAME_RATE) }).run

    useEffectWhen(function sendInitialBoard() {
        if (callerType === 'guest' && isCallConnected && !hasConnected) {
            emit({ type: 'request' })
        }
        if (callerType == null || !isCallConnected) {
            setHasConnected(false)
        }
    },
        [callerType, storageName, state, emit, isCallConnected, hasConnected],
        [callerType, isCallConnected, hasConnected])

    useEffect(function mountNetworkListener() {
        onDataEvent(storageName, (boardEvent: BoardEvent) => {
            if (boardEvent.type === 'state') {
                const { state: { isWhite, positions } } = boardEvent
                setState({
                    isWhite: !isWhite,
                    positions: positions,
                })
                setHasConnected(true)
            } else if (boardEvent.type === 'movement') {
                // debugger
                const { index, coords } = boardEvent
                setState(s => ({
                    ...s, positions: setAt(s.positions, index,
                        // [1 - coords[0], 1 - coords[1]]
                        coords
                    )
                }))
            } else if (boardEvent.type === 'request') {
                emit({ type: 'state', state: state })
                setHasConnected(true)
            }
        })
    }, [emit, setState, state, storageName])

    const buttonLeft = `calc(45% - ${~~(sideLength / 2)}px)`

    // const connectionIndicator = <div
    //     style={{ fontSize: `${~~(sideLength / 16)}px` }}>
    //     {hasConnected ? '✓' : '᠁'}
    // </div>

    const switchSides = useCallback(() => sendAndUpdate({
        positions: state.positions,
        isWhite: !state.isWhite,
    }), [sendAndUpdate, state])

    const restart = useCallback(() => sendAndUpdate(props.initialState), [props.initialState, sendAndUpdate])
    const restartButton = <div
        onClick={restart}
        style={{ fontSize: '20px', width: '36px', height: '36px', lineHeight: '36px', textAlign: 'center', background: 'rgba(255,255,255,.6)', border: '1px solid #F4E98C', borderRadius: '50%', marginRight: '6px', marginBottom: '8px' }} >
        ♺&#xFE0E;
    </div>

    const switchSidesButton = <div
        onClick={switchSides}
        style={{ fontSize: '20px', width: '36px', height: '36px', lineHeight: '36px', textAlign: 'center', background: 'rgba(255,255,255,.6)', border: '1px solid #666', borderRadius: '50%', marginRight: '6px' }} >
        &#x1145D;
    </div> // special unicode variation selector to force text


    const middle = ~~(props.chars.length / 2)
    const pieces =
        sideLength != null &&
        props.chars.map((char, i) =>
            <Piece
                changeCoords={changeCoords}
                index={i}
                key={i}
                boardFlipped={!state.isWhite}
                flip={i < middle}
                color={props.colors[+(i < middle)]}
                outlineColor={calcOutlineColor(props.colors[+(i < middle)])}
                char={char}
                boardSize={sideLength}
                doubleClickChar={props.doubleClickChar}
                fontScale={props.fontScale}
                coords={[state.positions[i][0] * sideLength, state.positions[i][1] * sideLength]} />
        )

    return <div ref={divRef} className={styles.chessroot} >
        {screenInfo.width > screenInfo.height ?
            <div style={{ left: buttonLeft, top: '40%', position: 'absolute' }}>
                {/* {connectionIndicator} TODO: delete? there's already a connection indicator at the top... */}
                {restartButton}
                {switchSidesButton}
            </div> :
            <div style={{ left: '12px', bottom: '60px', position: 'absolute', display: 'flex' }}>
                {/* {connectionIndicator} */}
                {restartButton}
                {switchSidesButton}
            </div>
        }
        <div className={styles.boardwrap} style={{
            transform: state.isWhite ? 'translate(-50%, -50%)' : 'translate(-50%, -50%) rotate(180deg)',
            transition: 'transform 1s ease-in-out',
            transformOrigin: 'center',
        }}>
            <GridBackground size={sideLength} />
            {pieces}
        </div>
    </div>
}


const GridBackground = React.memo(function GridBackground({ size }: { size: number }) {
    return <table className={styles.chessboard} style={{
        width: size + 'px', height: size + 'px'
    }}>
        <tbody>
            {repeat(8, (i) => <tr key={i}>{repeat(8, (i) => <td key={i}></td>)}</tr>)}
        </tbody>
    </table>
})

interface PieceProps {
    changeCoords: ChangeCoords,
    index: number,
    char: string,
    boardSize: number,
    coords: Coords,
    flip: boolean,
    boardFlipped: boolean,
    color: string,
    outlineColor: string,
    fontScale: number,
    doubleClickChar?: string,
}
const Piece = React.memo(function Piece(props: PieceProps): JSX.Element {
    const { index, changeCoords, boardSize } = props
    const [imMoving, setImMoving] = useState(false)
    const [shownChar, setShownChar] = useState(props.char)
    const handleMove = useCallback((coords, isFinal = false) => {
        setImMoving(!(isFinal as boolean))
        changeCoords(index, coords, isFinal)
    }, [changeCoords, index])
    const size = ~~(props.fontScale * boardSize / 8)
    const onRef = useDrag({ width: boardSize, height: boardSize }, handleMove, size, props.boardFlipped)
    const fontSize = size + 'px'
    const divSize = ~~(boardSize / 8) + 'px'
    return <div
        className={styles.piece}
        style={{
            WebkitTextStroke: props.outlineColor,
            position: 'absolute',
            textShadow: props.boardFlipped ? '-2px -2px 5px black' : '2px 2px 5px black',
            width: divSize,
            height: divSize,
            fontSize,
            color: props.color,
            transform: props.flip ? 'rotate(180deg)' : null,
            left: props.coords[0],
            top: props.coords[1],
            transition: imMoving ? '' : transitionStyle
        }}
        ref={onRef}
        onDoubleClick={() => props.doubleClickChar != null && setShownChar(char => char === props.char ? props.doubleClickChar : props.char)}
    >

        <div className={styles.char} style={{
            lineHeight: divSize,
        }}>{shownChar}</div>
    </div>
}, function areEqual(p, n) {
    return (
        p.boardSize === n.boardSize &&
        arrayEquals(p.coords, n.coords) &&
        p.flip === n.flip &&
        p.boardFlipped === n.boardFlipped &&
        p.color === n.color
    )
})


type onRefDrag = (n: HTMLElement) => void
function useDrag(bounds: Rect, handleMove, size: number, flip = false): onRefDrag {
    function onMount(elm: HTMLElement) {
        let isPointerDown = false
        let [downX, downY] = [0, 0]
        let [elmX, elmY] = [0, 0]
        elm.addEventListener('pointerdown', handlePointerDown)

        function getElmPos() {
            return [
                parseInt(elm.style.left) || 0, // in case of NaN
                parseInt(elm.style.top) || 0,
            ]
        }

        function handlePointerDown(event: PointerEvent) {
            isPointerDown = true;
            [elmX, elmY] = getElmPos();
            [downX, downY] = [event.clientX, event.clientY]
            document.addEventListener('pointermove', handlePointerMove)
            document.addEventListener('pointerup', handlePointerUp)
        }
        function handlePointerUp() {
            isPointerDown = false
            handleMove(getElmPos(), true)
            document.removeEventListener('pointermove', handlePointerMove)
            document.removeEventListener('pointerup', handlePointerUp)
        }

        function handlePointerMove(event: PointerEvent) {
            if (!isPointerDown) return
            handleMove(getElmPos())
            const [deltaX, deltaY] = flip ?
                [downX - event.clientX, downY - event.clientY] :
                [event.clientX - downX, event.clientY - downY]
            elm.style.left = `${clip(elmX + deltaX, -size, bounds.width)}px`
            elm.style.top = `${clip(elmY + deltaY, -size, bounds.height)}px`
        }

        return function cleanup() {
            elm.removeEventListener('pointerdown', handlePointerDown)
            document.removeEventListener('pointermove', handlePointerMove)
            document.removeEventListener('pointerup', handlePointerUp)
        }
    }
    return useOnRef(onMount, [bounds.height, bounds.width, flip, handleMove, size])
}


function repeat<T>(n: number, f: (index?) => T): T[] {
    return Array(n).fill(null).map((_, i) => f(i))
}

function clip(value: number, bottom: number, top: number) {
    return value < bottom ? bottom : ((value > top) ? top : value)
}

function calcOutlineColor(color) {
    const { h, s, v } = hexToHsv(color)
    return hsvToHex({ h, s, v: (v + 50) % 100 })
}
