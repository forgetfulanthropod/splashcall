/** All touches go through here; colors health indicator. */

export enum STAT {
    Cold,
    Connecting,
    StaleNoReceive,
    StaleReceive,
    Connected,
}

type Pingback = {
    eventId: 'pingbacktest'
    code: string
    state: number
}

import { DataConnection } from 'peerjs'
import { rand } from '../utils'

const myId = rand(8)
const pings = {}
let lastPing = null
let lastReceive = null

const dataConnections: {
    mainChannel?: DataConnection
    pingChannel?: DataConnection
    bigChannel?: DataConnection
} = { mainChannel: null, bigChannel: null, pingChannel: null }
export function closeDataConnections(): void {
    dataConnections.mainChannel?.close()
    dataConnections.mainChannel = null

    dataConnections.pingChannel?.close()
    dataConnections.pingChannel = null

    dataConnections.bigChannel?.close()
    dataConnections.bigChannel = null
}

function getLabel(connection) {
    return connection.label as 'mainChannel' | 'peerChannel' | 'bigChannel'
}

// data conn creation and listeners
export function addDataConnection(connection: DataConnection): void {
    if (dataConnections[getLabel(connection)]?.open as boolean) dataConnections[connection.label].close()
    debugLog('Opening data connection')
    dataConnections[getLabel(connection)] = connection
    connection.on('open', () => {
        debugLog('data connection opened')
    })
    connection.on('data', data => {
        if (data.eventId === 'pingbacktest') { handlePingback(data) }
        else { processDataEvent(data.eventId, data.data) }
    })
    connection.on('error', err => debugLog('dataconnection error:', err))
    connection.on('close', () => debugLog('dataconnection closed'))
}


let updateStatus = (_s: STAT) => null
export function onStatusChange(callback: (s: STAT) => void): void {
    updateStatus = callback
}

const eventListeners = {}
function processDataEvent(eventId: string, data: unknown): void {
    // debugLog('processing data event ', eventId, data)
    const listener = eventListeners[eventId]
    if (typeof listener === 'function') {
        listener(data)
    }
}
export function onDataEvent(eventId: string, callback: (u: unknown) => unknown): void {
    eventListeners[eventId] = callback
}
export function clearDataEvent(eventId: string): void {
    delete eventListeners[eventId]
}
export function emitDataEvent(eventId: string, data: unknown): void {
    if (!dataConnections.mainChannel?.open) return
    dataConnections.mainChannel.send({ eventId, data })
}
export function emitBigDataEvent(eventId: string, data: unknown): void {
    if (!dataConnections.bigChannel?.open) return
    dataConnections.bigChannel.send({ eventId, data })
}


function sendPingback(ms: Pingback) {
    if (dataConnections.pingChannel?.open) {
        dataConnections.pingChannel.send(ms)
    }
}


// console.info('My id:', myId)
function handlePingback(ms: Pingback) {
    // debugLog(obj)
    if (!ms.code) return
    if (ms.state == 0) {
        ms.state = 1
        lastReceive = Date.now()
        // debugLog("recieved: ", obj)
        sendPingback(ms)
    } else if (ms.state == 1) {
        if (ms.code in pings) {
            // const sentTime = pings[obj.code]
            lastPing = Date.now()
            //debugLog(Date.now(), obj, sentTime)
            updateStatus(STAT.Connected)
            // setDataStatusMessage("got pingback after " + (Date.now() - sentTime).toString())
            delete pings[ms.code]
        } else {
            // debugLog('code not in pings', obj.code, pings)
        }
    } else {
        alert('We\'re very sorry but something has gone wrong. Please try refreshing.')
    }
}
const STALE_TIME_THRESHOLD = 4 * 1000
// loop for checking for stale connection
setInterval(() => {
    if (dataConnections.pingChannel?.open) {
        if (lastReceive == null || lastPing == null) {
            updateStatus(STAT.Connecting)
            // setDataStatusMessage("Open, establishing pingbacks")
        } else if (Date.now() - lastPing > STALE_TIME_THRESHOLD) { // stale ping
            if (Date.now() - lastReceive > STALE_TIME_THRESHOLD) { // stale receive
                updateStatus(STAT.StaleNoReceive)
                // setDataStatusMessage("Stale (open) connection, not receiving")
            } else {
                updateStatus(STAT.StaleReceive)
                // setDataStatusMessage("Stale (open) connection, is receiving")
            }
        } else {
            // Don't need this an "Open" message because we know based lastPing
            // that the listener is actively updating the message.
        }
    } else {
        updateStatus(STAT.Cold)
        // setDataStatusMessage("Not Open")
    }
}, 200)


// loop for sending pings
setInterval(() => {
    const pingCode = myId + ',' + rand(8)
    sendPingback({ eventId: 'pingbacktest', state: 0, code: pingCode })
    pings[pingCode] = Date.now()
}, 1000)

const DEBUG_DATA_CONN = false
function debugLog(...args: unknown[]): void {
    if (DEBUG_DATA_CONN) {
        console.log(...args)
    }
}
