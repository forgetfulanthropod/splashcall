import { useEffect } from 'react'
import { useAppContext } from '../../context'
import { clearDataEvent, emitBigDataEvent, emitDataEvent, onDataEvent } from '../../connection/dataConn'
import { acceptCreation } from './sandbox'
import { addCreatedCard, listCreatedCards, removeCreatedCard, setCreatedPublisher } from './store'
import { CreatedCard } from './types'

const UPSERT = 'card-creator'
const REMOVE = 'card-creator-delete'

function shareCard(card: CreatedCard): void {
    let approx = 0
    try { approx = JSON.stringify(card).length } catch (err) { approx = 0 }
    if (approx > 0 && approx < 14000) emitDataEvent(UPSERT, card)
    emitBigDataEvent(UPSERT, card)
}

function shareRemoval(id: string): void {
    emitDataEvent(REMOVE, { id })
    emitBigDataEvent(REMOVE, { id })
}

function cardFromPeer(data: unknown): CreatedCard | null {
    if (data == null || typeof data !== 'object') return null
    const raw = data as { id?: unknown, createdAt?: unknown }
    if (typeof raw.id !== 'string' || !/^created-[a-z0-9]{6,40}$/.test(raw.id)) return null
    const creation = acceptCreation(data)
    if (creation == null) return null
    const createdAt = typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now()
    return Object.assign({ id: raw.id, createdAt }, creation)
}

/** Sends toys across the call, and keeps ones the other person makes. */
export default function CreatedCardSync(): null {
    const { isCallConnected } = useAppContext()

    useEffect(() => {
        setCreatedPublisher(function (event) {
            if (event.type === 'add') shareCard(event.card)
            else shareRemoval(event.id)
        })
        onDataEvent(UPSERT, function (data) {
            const card = cardFromPeer(data)
            if (card != null) addCreatedCard(card, { remote: true })
        })
        onDataEvent(REMOVE, function (data) {
            if (data != null && typeof data === 'object' && 'id' in data) {
                const id = (data as { id: unknown }).id
                if (typeof id === 'string') removeCreatedCard(id, { remote: true })
            }
        })
        return function () {
            setCreatedPublisher(null)
            clearDataEvent(UPSERT)
            clearDataEvent(REMOVE)
        }
    }, [])

    useEffect(() => {
        if (!isCallConnected) return undefined
        function sendAll(): void {
            listCreatedCards().forEach(shareCard)
        }
        sendAll()
        const timer = window.setTimeout(sendAll, 1200)
        return function () { window.clearTimeout(timer) }
    }, [isCallConnected])

    return null
}
