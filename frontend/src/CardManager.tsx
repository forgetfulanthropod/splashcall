import React, { Suspense, useState } from 'react'
import { useAppContext } from './context'
import { CardId } from './constants'
import Doodle from './cards/doodle/Doodle'
import FlatWaves from './cards/FlatWaves'
import FluidSimulation from './cards/fluid-simulation/FluidSimulation'
import Maze from './cards/Maze'
import Chess from './cards/Chess'
import Checkers from './cards/Checkers'
import Loader from './Loader'
import Snowflake from './cards/Snowflake'
import Tentacles from './cards/tentacles/Tentacles'
import PhotoStack from './cards/PhotoStack'
import ErrorBoundary from './ErrorBoundary'

const BouncyBalls = React.lazy(() => import('./cards/BouncyBalls'))
const FallingSand = React.lazy(() => import('./cards/falling-sand/FallingSand'))
const VoiceVisualizer = React.lazy(() => import('./cards/VoiceVisualizer'))

export const nameToCard: Record<CardId, React.FC> = {
    BouncyBalls,
    Doodle,
    FallingSand,
    Chess,
    Checkers,
    FlatWaves,
    FluidSimulation,
    Maze,
    Snowflake,
    PhotoStack,
    VoiceVisualizer,
    Tentacles,
}

export default function CardManager(): JSX.Element {
    const { reload$, settings: { id }, aspect: { screenInfo } } = useAppContext()
    const Card = nameToCard[id]

    const [shown, triggerReload] = useReload()

    reload$.useSubscription(() => {
        triggerReload()
    })

    return <Suspense fallback={<Loader />}>
        {shown && screenInfo != null
            ?
            <ErrorBoundary message="Card has crashed. Change cards below ↓">
                <Card />
            </ErrorBoundary>
            :
            <Loader />}
    </Suspense>
}

function useReload(): [boolean, () => void] {
    const [shown, setShown] = useState(true)
    function triggerReload() {
        setShown(false)
        setTimeout(() => setShown(true), 100)
    }
    return [shown, triggerReload]
}
