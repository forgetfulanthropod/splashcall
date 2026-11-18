import React, { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import { useAppContext } from '../context'
import { CardId } from '../constants'

import TentaclesPng from 'assets/cards/Tentacles-200.png'
import FallingSandPng from 'assets/cards/FallingSand-200.png'
import DoodlePng from 'assets/cards/Doodle-200.png'
import FluidSimulationPng from 'assets/cards/FluidSimulation-200.png'
import SnowflakePng from 'assets/cards/Snowflake-200.png'
import MazePng from 'assets/cards/Maze-200.png'
import PhotoStackPng from 'assets/cards/PhotoStack-200.png'
import VoiceVisualizerPng from 'assets/cards/VoiceVisualizer-200.png'
import FlatWavesPng from 'assets/cards/FlatWaves-200.png'
import ChessPng from 'assets/cards/Chess-200.png'
import CheckersPng from 'assets/cards/Checkers-200.png'
import BouncyBallsPng from 'assets/cards/BouncyBalls-200.png'
import OpenWorldPng from 'assets/cards/OpenWorld-200.png'
import { cardCreatorPreviewSrc } from '../cards/card-creator/preview'
import CreatedThumb from '../cards/card-creator/CreatedThumb'
import { removeCreatedCard, removeCreatedCards, setActiveCreated, peekUndo, undoLastDelete, useCreatedState } from '../cards/card-creator/store'

const Root = styled.div`
    // white-space: nowrap;
    overflow-x: auto;
    padding-bottom: 9px;
    text-align: right;
    color: #666;
    &::-webkit-scrollbar {
        display: none;
    }
`

const Filter = styled.span<{ isSelected: boolean }>`
    background: #e0e5ec;
    margin: 4px;
    display: inline-block;
    height: 26px;
    line-height: 26px;
    border-radius: 1.2rem;
    // border-radius: 26px;
    // border: 1px solid #999;
    padding: 3px 12px;
    box-shadow: 0.3rem 0.3rem 0.5rem rgb(195 193 198 / 90%), -0.2rem -0.2rem 0.4rem #fff;


    ${p => p.isSelected && `
        box-shadow: inset 0.2rem 0.2rem 0.5rem rgb(195 193 198 / 90%), inset -0.2rem -0.2rem 0.5rem #fff;
        // background: rgba(255,255,255,.8);
        // box-shadow: 0 0 0px 1px #999;
    `}
`

const CardPreviewsContainer = styled.div`
    display: flex;
    align-items: flex-end;
    overflow-x: auto;
    padding-bottom: 12px;
    margin-left: -1px;
    border-radius: 12px;
    background-image: linear-gradient(to right, #DFE5EC, #DFE5EC),
    linear-gradient(to right, #DFE5EC, #DFE5EC),
    linear-gradient(to right, rgba(100, 100, 100, 0.25), rgba(223, 229, 236, 0)),
    linear-gradient(to left, rgba(100, 100, 100, 0.25), rgba(223, 229, 236, 0));
    background-position: left center, right center, left center, right center;
    background-repeat: no-repeat;
    background-color: #DFE5EC;
    background-size: 30px;
    background-attachment: local, local, scroll, scroll;
`

const CardPreview = styled.img<{ isSelected: boolean }>`
    margin: 8px;
    border-radius: 3px;
    box-shadow: 0.3rem 0.3rem 0.5rem rgb(195 193 198 / 90%), -0.2rem -0.2rem 0.4rem #fff;
    padding: 8px;
    ${p => p.isSelected && 'box-shadow: inset 0.2rem 0.2rem 0.5rem rgb(195 193 198 / 90%), inset -0.2rem -0.2rem 0.5rem #fff;'}
`


const EmptyMine = styled.div`
    margin: 8px;
    min-width: 140px;
    height: 120px;
    box-sizing: content-box;
    padding: 8px;
    border-radius: 3px;
    display: flex;
    align-items: center;
    text-align: left;
    font-size: 13px;
    line-height: 1.35;
    color: #556;
`

export default function TextureSwitcher(): JSX.Element {
    const { settings: { id: cardId }, setSettings, allSettings } = useAppContext()
    const created = useCreatedState()
    const [category, setCategory] = useState<Category>(undefined)
    const [undoTick, setUndoTick] = useState(0)
    const seen = useRef(created.cards.length)

    useEffect(() => {
        if (created.cards.length > seen.current) setCategory('mine')
        seen.current = created.cards.length
    }, [created.cards.length])

    const CardPreviews: Record<CardId, string> = {
        Tentacles: TentaclesPng,
        FallingSand: FallingSandPng,
        Doodle: DoodlePng,
        FluidSimulation: FluidSimulationPng,
        Snowflake: SnowflakePng,
        Maze: MazePng,
        PhotoStack: PhotoStackPng,
        VoiceVisualizer: VoiceVisualizerPng,
        FlatWaves: FlatWavesPng,
        Chess: ChessPng,
        Checkers: CheckersPng,
        BouncyBalls: BouncyBallsPng,
        OpenWorld: OpenWorldPng,
        CardCreator: cardCreatorPreviewSrc,
    }

    type Category = 'texture' | 'creator' | 'game' | 'mine'
    const TextureTags: Record<CardId, Category[]> = {
        Tentacles: ['game', 'texture'],
        FallingSand: ['game', 'texture'],
        Doodle: ['creator'],
        FluidSimulation: ['texture'],
        Snowflake: ['creator'],
        Maze: ['game'],
        PhotoStack: ['creator'],
        VoiceVisualizer: ['texture'],
        FlatWaves: ['texture'],
        Chess: ['game'],
        Checkers: ['game'],
        BouncyBalls: ['texture'],
        OpenWorld: ['game'],
        CardCreator: ['creator'],
    }

    const categories: Category[] = ['texture', 'creator', 'game']

    const hidden: CardId[] = ['VoiceVisualizer']

    const showBuiltIns = category !== 'mine'
    const mineCards = category === 'mine' ? created.cards.slice().reverse() : []
    const gameIds = created.cards.filter(card => card.kind === 'game').map(card => card.id)
    const canUndo = undoTick >= 0 && peekUndo().length > 0

    return <Root>
        <CardPreviewsContainer>
            {showBuiltIns && Object.entries(CardPreviews)
                .filter(([id]) => !hidden.includes(id as CardId))
                .filter(([id]) => category == null || TextureTags[id].includes(category))
                .map(([id, path]) =>
                    <CardPreview
                        width={60}
                        height={120}
                        id={id}
                        src={path}
                        key={id}
                        onClick={() => {
                            setActiveCreated(null)
                            setSettings(allSettings[id])
                        }}
                        isSelected={created.activeId == null && id === cardId}
                    />
                )
            }
            {category === 'mine' && mineCards.length === 0 &&
                <EmptyMine>Nothing in mine yet. Create a card, then tap the red × to throw a bad one away.</EmptyMine>
            }
            {mineCards.map((card, index) =>
                <CreatedThumb
                    key={card.id}
                    card={card}
                    selected={card.id === created.activeId}
                    wiggling={false}
                    confirming={false}
                    delay={index * 0.04}
                    onOpen={() => setActiveCreated(card.id)}
                    onLongPress={() => undefined}
                    onArmDelete={() => undefined}
                    onConfirmDelete={() => {
                        removeCreatedCard(card.id)
                        setUndoTick(tick => tick + 1)
                    }}
                />
            )}
        </CardPreviewsContainer>
        <div style={{ overflowX: 'auto', padding: '6px 0' }}>
            {categories.map(c =>
                <Filter key={c}
                    onClick={() => setCategory(prev => prev === c ? undefined : c)}
                    isSelected={category === c}>
                    {c}s
                </Filter>)
            }
            <Filter
                id="MineFilter"
                onClick={() => setCategory(prev => prev === 'mine' ? undefined : 'mine')}
                isSelected={category === 'mine'}
            >
                mine{created.cards.length > 0 ? ' ' + created.cards.length : ''}
            </Filter>
            {category === 'mine' && gameIds.length > 0 && <Filter
                id="ClearGames"
                onClick={(event) => {
                    event.stopPropagation()
                    removeCreatedCards(gameIds)
                    setUndoTick(tick => tick + 1)
                }}
                isSelected={false}
            >
                delete games
            </Filter>}
            {canUndo && <Filter
                id="UndoDelete"
                onClick={(event) => {
                    event.stopPropagation()
                    undoLastDelete()
                    setUndoTick(tick => tick + 1)
                }}
                isSelected={false}
            >
                undo
            </Filter>}
        </div>
    </Root >
}
