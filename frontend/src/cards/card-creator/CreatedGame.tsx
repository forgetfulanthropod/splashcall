import React from 'react'
import styled from 'styled-components'
import { GAME_IFRAME_SANDBOX, prepareGameHtml } from './sandbox'
import { CreatedCard } from './types'

const Frame = styled.iframe`
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: 0;
    background: #101820;
`

const Fallback = styled.div`
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    text-align: center;
    background: #101820;
    color: #fff;
    font-size: 18px;
`

export default function CreatedGame({ card }: { card: CreatedCard }): JSX.Element {
    const html = prepareGameHtml(card.gameHtml)
    if (html == null) {
        return <Fallback>This game could not be opened safely.</Fallback>
    }
    return <Frame
        id="CreatedGame"
        title={card.title}
        sandbox={GAME_IFRAME_SANDBOX}
        srcDoc={html}
        referrerPolicy="no-referrer"
        allow=""
    />
}
