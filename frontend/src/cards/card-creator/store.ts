/**
 * Created toys live on the device, next to the built-in card list.
 * localStorage survives a restart in the browser and inside the Capacitor web view.
 * No native plugin is added, so the Android and iOS projects stay untouched.
 */

import { useEffect, useState } from 'react'
import { rand } from '../../utils'
import { acceptCreation } from './sandbox'
import { CreatedCard, Creation } from './types'

const CARDS_KEY = 'splashcall.createdCards.v1'
const ACTIVE_KEY = 'splashcall.activeCreated.v1'
const MAX_CARDS = 24
const MAX_BYTES = 2500000

let undoBatch: CreatedCard[] = []

export type CreatedState = {
    cards: CreatedCard[]
    activeId: string | null
}

type PublishEvent = { type: 'add', card: CreatedCard } | { type: 'remove', id: string }

type Listener = (state: CreatedState) => void

let state: CreatedState = load()
const listeners = new Set<Listener>()
let publisher: ((event: PublishEvent) => void) | null = null

function readStorage(key: string): string | null {
    try {
        if (typeof localStorage === 'undefined') return null
        return localStorage.getItem(key)
    } catch (err) {
        return null
    }
}

function load(): CreatedState {
    let cards: CreatedCard[] = []
    const raw = readStorage(CARDS_KEY)
    if (raw != null) {
        try {
            const parsed: unknown = JSON.parse(raw)
            if (Array.isArray(parsed)) {
                cards = parsed.map(acceptStored).filter(function (card): card is CreatedCard {
                    return card != null
                })
            }
        } catch (err) {
            cards = []
        }
    }
    const savedActive = readStorage(ACTIVE_KEY)
    const activeId = savedActive != null && cards.some(card => card.id === savedActive) ? savedActive : null
    return { cards, activeId }
}

function acceptStored(value: unknown): CreatedCard | null {
    if (value == null || typeof value !== 'object') return null
    const raw = value as { id?: unknown, createdAt?: unknown }
    if (typeof raw.id !== 'string' || !/^created-[a-z0-9]{6,40}$/.test(raw.id)) return null
    const creation = acceptCreation(value)
    if (creation == null) return null
    const createdAt = typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now()
    return Object.assign({ id: raw.id, createdAt }, creation)
}

function persist(): void {
    try {
        localStorage.setItem(CARDS_KEY, JSON.stringify(state.cards))
        if (state.activeId != null) localStorage.setItem(ACTIVE_KEY, state.activeId)
        else localStorage.removeItem(ACTIVE_KEY)
    } catch (err) {
        // The in-memory copy still works for this visit if storage is full.
    }
}

function emit(): void {
    listeners.forEach(listener => listener(state))
}

function publish(event: PublishEvent): void {
    if (publisher != null) publisher(event)
}

export function newCardId(): string {
    return 'created-' + rand(8, true) + Date.now().toString(36)
}

export function getCreatedState(): CreatedState {
    return state
}

export function listCreatedCards(): CreatedCard[] {
    return state.cards.slice()
}

export function subscribeCreated(listener: Listener): () => void {
    listeners.add(listener)
    listener(state)
    return function () { listeners.delete(listener) }
}

export function useCreatedState(): CreatedState {
    const [snapshot, setSnapshot] = useState<CreatedState>(state)
    useEffect(() => subscribeCreated(setSnapshot), [])
    return snapshot
}

export function setCreatedPublisher(next: ((event: PublishEvent) => void) | null): void {
    publisher = next
}

export function cardFromCreation(creation: Creation): CreatedCard {
    return Object.assign({ id: newCardId(), createdAt: Date.now() }, creation)
}

function fits(cards: CreatedCard[]): boolean {
    try {
        return JSON.stringify(cards).length <= MAX_BYTES
    } catch (err) {
        return false
    }
}

export function addCreatedCard(card: CreatedCard, opts?: { remote?: boolean, keepActive?: boolean }): boolean {
    if (state.cards.some(item => item.id === card.id)) return true
    const remote = opts != null && opts.remote === true
    const keepActive = opts != null && opts.keepActive === true
    let cards = state.cards.concat([card])
    while (cards.length > MAX_CARDS || !fits(cards)) {
        if (cards.length <= 1) return false
        cards = cards.slice(1)
    }
    const preferred = remote || keepActive ? state.activeId : card.id
    const stillThere = preferred != null && cards.some(item => item.id === preferred)
    state = { cards, activeId: stillThere ? preferred : null }
    persist()
    emit()
    if (!remote) publish({ type: 'add', card })
    return true
}

export function peekUndo(): CreatedCard[] {
    return undoBatch.slice()
}

export function undoLastDelete(): number {
    if (undoBatch.length === 0) return 0
    const cards = undoBatch
    undoBatch = []
    let restored = 0
    for (let i = 0; i < cards.length; i++) {
        if (addCreatedCard(cards[i], { keepActive: true })) restored += 1
    }
    return restored
}

export function removeCreatedCards(ids: string[], opts?: { remote?: boolean }): void {
    const remote = opts != null && opts.remote === true
    const wanted = new Set(ids)
    const gone = state.cards.filter(card => wanted.has(card.id))
    if (gone.length === 0) return
    const cards = state.cards.filter(card => !wanted.has(card.id))
    const activeId = state.activeId != null && wanted.has(state.activeId) ? null : state.activeId
    state = { cards, activeId }
    if (!remote) undoBatch = gone
    persist()
    emit()
    if (!remote) {
        for (let i = 0; i < gone.length; i++) publish({ type: 'remove', id: gone[i].id })
    }
}

export function removeCreatedCard(id: string, opts?: { remote?: boolean }): void {
    const found = state.cards.find(card => card.id === id)
    if (found == null) return
    const remote = opts != null && opts.remote === true
    const cards = state.cards.filter(card => card.id !== id)
    const activeId = state.activeId === id ? null : state.activeId
    state = { cards, activeId }
    if (!remote) undoBatch = [found]
    persist()
    emit()
    if (!remote) publish({ type: 'remove', id })
}

export function setActiveCreated(id: string | null): void {
    if (state.activeId === id) return
    if (id != null && !state.cards.some(card => card.id === id)) return
    state = { cards: state.cards, activeId: id }
    persist()
    emit()
}
