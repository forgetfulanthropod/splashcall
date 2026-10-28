/** Does the P2P handshake at start of call & disconnect & reconnect */

import { addDataConnection, closeDataConnections, emitDataEvent, onDataEvent } from './dataConn'
import Peer, { MediaConnection } from 'peerjs'
import { getUserMedia, relinquishUserMedia } from './AudioManager'
import { backendUrl, isLocal, platform } from '../environment'
import { sleep } from '../utils'
import toast from 'react-hot-toast'

const DEBUG_PEER = true
const callerTypeHandShakeTime = 250
const peerReconnectWaitTime = 1000
const maxReconnectTries = 1000000

function displayError(message) {
    debugError(message)
}

// PROBLEM: we now confirm with the user before they close the tab,
// saving the tab ends the call but leaves the user trying to connect.
window.addEventListener('beforeunload', () =>
    emitDataEvent('goodbye', false)
)

onDataEvent('goodbye', (shouldClearCode: boolean) => {
    debugLog('goodbye event triggered with', { shouldClearCode })
    hangup(false, shouldClearCode)
})

type AppState = { setCallerType, otherName, setOtherName, setIsCallConnected, setIsPeerReady }
let appState: AppState = undefined
export function shareState(newState: AppState): void {
    appState = newState
}

const { makeHostClaim, setCallerType, handleHostClaim } = (() => {
    let claimedHostAt: number = null
    let timeoutId = null
    function setCallerType(ct: null | 'host' | 'guest') {
        clearTimeout(timeoutId)
        if (ct === 'guest' || ct == null) {
            claimedHostAt = null
        } else if (claimedHostAt == null && ct === 'host') {
            claimedHostAt = Date.now()
        }

        // a short timeout before giving it to the app avoids some re-renders / flashing
        timeoutId = setTimeout(() => appState?.setCallerType(ct), callerTypeHandShakeTime)
    }

    let receivedHostClaim = false
    function handleHostClaim(timestamp: number) {
        if (timestamp < claimedHostAt || claimedHostAt == null) { // they claimed host first
            debugLog('accepted other host claim')
            setCallerType('guest')
        } else {
            debugLog('rejected other host claim')
            if (!receivedHostClaim) {
                // Send claim one more time in case first one didn't go through
                makeHostClaim()
            }
            receivedHostClaim = true
        }
    }
    function makeHostClaim() {
        if (claimedHostAt != null) {
            emitDataEvent('hostClaim', claimedHostAt)
        }
    }
    return { makeHostClaim, setCallerType, handleHostClaim }
})()

let peer: Peer = undefined
let mediaConn: MediaConnection = undefined
// let localOtherName: string = undefined

const PEER_CONNECTION_CONFIG: RTCConfiguration = {
    iceServers: [
        {
            urls: [
                'stun:stun.drogon.net:3478',
                'stun:stun.duocom.es:3478',
            ]
        },
        {
            urls: 'turn:172.105.152.123?transport=tcp',
            username: 'foo',
            credential: 'bar',
        },
    ]
}

let playRemoteStream = (_s: MediaStream) => {
    displayError('oops, playRemoteStream not initialized')
    return function cleanup() {
        debugLog('no remote stream to cleanup yet')
        return null
    }
}
let cleanUpLastStream = () => null
export function onRemoteStream(callback: (s: MediaStream) => () => void): void {
    playRemoteStream = callback
}

let shouldReconnect = false
export function setupPeer(code: string): void {
    if (code.length < 2) {
        debugLog('tried to make peer but name was less than two characters')
        return
    }
    if (peer != null) {
        if (peer.id === code) {
            debugLog('almost made same peer twice')
            return
        }
        shouldReconnect = false
        peer.destroy()
    }
    shouldReconnect = true
    debugLog(`making peer with ${code}...`)
    let reconnectTries = 0
    peer = makeNewPeer(code)
    if (peer == null) {
        shouldReconnect = false
        return
    }
    peer.on('error', handleError)

    peer.on('connection', conn => {
        appState.setOtherName(conn.peer)
        debugLog(`peer connection with ${conn.peer} found`)
        addDataConnection(conn)
    })

    peer.on('call', async (mc: Peer.MediaConnection) => {
        reconnectTries = 0
        debugLog(`received call from peer ${mc.peer}`)
        const stream = await getUserMedia()
        mc.answer(stream)
        bindMediaConnection(mc)
        setCallerType('host')
        makeHostClaim()
        onDataEvent('hostClaim', handleHostClaim)
    })
    peer.on('disconnected', () => {
        setTimeout(() => {
            if (shouldReconnect && peer != null && !peer.destroyed && peer.disconnected && reconnectTries < maxReconnectTries) {
                reconnectTries += 1
                peer?.reconnect()
                if (mediaConn == null || !mediaConn?.open) {
                    // TODO: does this mess up relinquishmedia with microphones disabled?
                    doCall(appState.otherName)
                }
            }
        }, peerReconnectWaitTime)
    })

    peer.on('open', () => {
        debugLog('connected to server')
        appState.setIsPeerReady(true)
    })

    peer.on('close', async () => {
        debugLog('peer connection fatal error')
        appState.setIsPeerReady(false)
        hangup(true)
        peer.destroy()
        peer = undefined
    })
}

function handleError(err) {
    // https://peerjs.com/docs.html#peeron-error
    debugError('peer err:', err)
    switch (err.type) {
        case 'browser-incompatible':
            // FATAL The client's browser does not support some or all WebRTC features that you are trying to use.
            toast('Your browser does not permit peer-to-peer connections, sorry')
            break
        case 'disconnected':
            // You've already disconnected this peer from the server and can no longer make any new connections on it.
            break
        case 'invalid-id':
            // FATAL The ID passed into the Peer constructor contains illegal characters.
            break
        case 'invalid-key':
            // FATAL The API key passed into the Peer constructor contains illegal characters or is not in the system (cloud server only).
            break
        case 'network':
            // Lost or cannot establish a connection to the signalling server.
            break
        case 'peer-unavailable':
            // The peer you're trying to connect to does not exist.
            toast('Could not find someone with that name')
            break
        case 'ssl-unavailable':
            // FATAL PeerJS is being used securely, but the cloud server does not support SSL. Use a custom PeerServer.
            break
        case 'server-error':
            // FATAL Unable to reach the server.
            toast('Could not connect to server')
            break
        case 'socket-error':
            // FATAL An error from the underlying socket.
            break
        case 'socket-closed':
            // FATAL The underlying socket closed unexpectedly.
            break
        case 'unavailable-id':
            // SOMETIMES FATAL The ID passed into the Peer constructor is already taken.
            toast('That name has already been taken')
            break
        case 'webrtc':
            // Native WebRTC errors.
            break
        default:
        // pass
    }
}

function bindMediaConnection(mc: Peer.MediaConnection): void {
    if (mediaConn?.open) {

        mediaConn.close()
        debugLog('Closing old media connection...')
    }
    mediaConn = mc
    debugLog('Binding media connection')
    mc.on('stream', s => {
        cleanUpLastStream()
        debugLog('got remote stream')
        cleanUpLastStream = playRemoteStream(s)
    })
    mc.on('close', () => {
        debugLog('call closed')
    })
    mc.on('error', (err) => debugLog('call error:', err))
}

export async function doCall(otherName: string): Promise<void> {
    if (otherName.length < 2) {
        debugLog('tried to connect to other peer but code was too short')
        return
    }
    if (!(peer?.disconnected === false)) {
        debugLog('I\'m not ready yet to call someone else')
        return
    }

    debugLog(`about to connect to peer ${otherName}`)

    addDataConnection(peer.connect(otherName, { label: 'pingChannel' }))

    addDataConnection(peer.connect(otherName, { label: 'mainChannel' }))

    addDataConnection(peer.connect(otherName, { label: 'bigChannel' }))

    const stream = await getUserMedia()
    debugLog(`about to call peer ${otherName}`)
    // localOtherName = otherName
    const mc = peer.call(otherName, stream)
    bindMediaConnection(mc)
    setCallerType('guest')
}

export async function hangup(shouldSendGoodbye = false, shouldClearCode = false): Promise<void> {
    debugLog('hanging up')
    appState.setIsCallConnected(false)
    if (shouldClearCode) {
        debugLog('clearing my code')
        // localOtherName = null
        appState.setOtherName('')
    }
    if (shouldSendGoodbye) {
        emitDataEvent('goodbye', shouldClearCode)
        await sleep(500) // hope they got it
    }
    closeDataConnections()
    cleanUpLastStream()
    mediaConn?.close()
    mediaConn = null
    peer?.disconnect()
    setCallerType(null)
    relinquishUserMedia()
}

function pageHostname(): string | null {
    if (typeof window === 'undefined') return null
    return window.location.hostname
}

function isLocalPage(): boolean {
    // The native app is served from https://localhost inside the WebView.
    // That hostname is not a development machine, so it must not select the
    // local peer server (port 9000). Otherwise calls on a phone never leave the device.
    if (platform !== 'web') return false
    const hostname = pageHostname()
    return hostname === 'localhost' || hostname === '127.0.0.1'
}

function signalingHost(): string {
    if (typeof backendUrl === 'string' && backendUrl !== '') return backendUrl
    return 'localhost'
}

let didReportUnconfiguredSignaling = false

function reportUnconfiguredSignaling(): void {
    if (didReportUnconfiguredSignaling) return
    didReportUnconfiguredSignaling = true
    const message = 'Peer signaling server is not configured. Refusing to connect to localhost. Set REACT_APP_BACKEND_URL to the peer server host.'
    console.error(message)
    toast(message)
}

function makeNewPeer(code: string): Peer | undefined {
    const host = signalingHost()
    const useLocalPeer = isLocal || isLocalPage()
    debugLog('backend url:', backendUrl)

    if (useLocalPeer) {
        return new Peer(code, {
            // key: 'peerjs', // our backend has no key for now
            host,
            port: 9000,
            path: '/call',
            config: PEER_CONNECTION_CONFIG,
            debug: isLocal ? 2 : 0,
            secure: false,
        })
    }

    if (backendUrl == null || backendUrl === '' || backendUrl === 'localhost') {
        reportUnconfiguredSignaling()
        return undefined
    }

    const secure = typeof window !== 'undefined' && window.location.protocol === 'https:'
    return new Peer(code, {
        // key: 'peerjs', // our backend has no key for now
        host,
        port: 443,
        path: '/call',
        config: PEER_CONNECTION_CONFIG,
        debug: isLocal ? 2 : 0,
        secure,
    })
}

function debugLog(...args: unknown[]): void {
    if (DEBUG_PEER) {
        console.log(...args)
    }
}

function debugError(...args) {
    if (DEBUG_PEER) {
        console.error(...args)
    }
}
