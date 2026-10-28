import React, { useEffect } from 'react'
import './App.css'
import './firebase'
import AudioFeedback from './connection/AudioFeedback'
import { Provider } from './context'
import Connector from './connection/Connector'
import { isDev } from './environment'
import Controls from './drawer/Controls'
import CardManager from './CardManager'
import Resizer from './Resizer'
// import { initializeTabChecker } from './utils'
// import { Capacitor } from "@capacitor/core"
// import ShareButton from "./ShareButton"
import { Toaster } from 'react-hot-toast'
import ErrorBoundary from './ErrorBoundary'
import { maybeInitialize as initializeFirebase } from './firebase'
import WonderSync from 'connection/WonderSync'

// const isAnotherTabOpen: boolean = initializeTabChecker()

export default function App(): JSX.Element {
    useEffect(initializeFirebase, [])
    // if (isAnotherTabOpen) return <h1>Splashcall is already open in another tab or window</h1>
    return <div className='app'>
        <Toaster />
        <Provider>
            <Resizer>
                <DevWarning />

                <ErrorBoundary message="Error occurred connecting to peer">
                    <Connector />
                </ErrorBoundary>

                <ErrorBoundary message="Card manager has crashed. Please clear browser data and refresh.">
                    <CardManager />
                </ErrorBoundary>

                <AudioFeedback />

                <Controls />

                <WonderSync />
            </Resizer>
        </Provider>
    </div>
}


function DevWarning(): JSX.Element {
    return isDev ? <div className='devWarning'>Dev</div> : <></>
}
