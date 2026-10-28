import React from 'react'
import { useAppContext } from '../context'
import { range } from '../utils'
import { Board, BoardState, Coords } from './Board'



export default function Chess(): JSX.Element {
    const { settings } = useAppContext()

    return <Board
        storageName="chessData"
        initialState={initialState}
        colors={settings.drawer.colors.value as [string, string]}
        chars={chars}
        fontScale={1}
    />
}

const initialPositions = [
    ...range(0, 1, 1 / 8).map(x => [x, 0]),
    ...range(0, 1, 1 / 8).map(x => [x, 1 / 8]),
    ...range(0, 1, 1 / 8).map(x => [x, 6 / 8]),
    ...range(0, 1, 1 / 8).map(x => [x, 7 / 8]),
]
const initialState: BoardState = {
    isWhite: true,
    positions: initialPositions as Coords[],
}

const chars = [
    '♜', '♞', '♝', '♛', '♚', '♝', '♞', '♜',
    '♟︎', '♟︎', '♟︎', '♟︎', '♟︎', '♟︎', '♟︎', '♟︎',
    '♟︎', '♟︎', '♟︎', '♟︎', '♟︎', '♟︎', '♟︎', '♟︎',
    '♜', '♞', '♝', '♛', '♚', '♝', '♞', '♜',
]

//props.color === 'black' ? '1px ' : '1px '
