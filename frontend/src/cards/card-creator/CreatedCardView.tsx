import React from 'react'
import CreatedGame from './CreatedGame'
import CreatedObject from './CreatedObject'
import { CreatedCard } from './types'

export default function CreatedCardView({ card }: { card: CreatedCard }): JSX.Element {
    if (card.kind === 'game') return <CreatedGame card={card} />
    return <CreatedObject card={card} />
}
