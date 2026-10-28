import React, { useState } from 'react'
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


export default function TextureSwitcher(): JSX.Element {
    const { settings: { id: cardId }, setSettings, allSettings } = useAppContext()
    const [category, setCategory] = useState<Category>(undefined)

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
    }

    type Category = 'texture' | 'creator' | 'game'
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
    }

    const categories: Category[] = ['texture', 'creator', 'game']

    const hidden: CardId[] = ['VoiceVisualizer']

    return <Root>
        <CardPreviewsContainer>
            {Object.entries(CardPreviews)
                .filter(([id]) => !hidden.includes(id as CardId))
                .filter(([id]) => category == null || TextureTags[id].includes(category))
                .map(([id, path]) =>
                    <CardPreview
                        width={60}
                        height={120}
                        id={id}
                        src={path}
                        key={id}
                        onClick={() => setSettings(allSettings[id])}
                        isSelected={id === cardId}
                    />
                )
            }
        </CardPreviewsContainer>
        <div style={{ overflowX: 'auto', padding: '6px 0' }}>
            {categories.map(c =>
                <Filter key={c}
                    onClick={() => setCategory(prev => prev === c ? undefined : c)}
                    isSelected={category === c}>
                    {c}s
                </Filter>)
            }
        </div>
    </Root >
}
