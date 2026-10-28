import { addDoc, collection, DocumentData, DocumentReference, Timestamp, updateDoc } from "firebase/firestore"
import { isDev, isLocal, envName, EnvName } from './environment'
import { getDb } from './firebase'

let cards = null
let currentCallDocRef: DocumentReference<DocumentData> = null
let callStartTime = null
let lastLogTime = null
let lastCardName = null

type CallEntry = {
    start_time: Date
    usernames: string[]
    host: string
    guest: string
    environment: EnvName
    end_time: Date
    duration: number
    cards: Record<string, { duration: number }>
}

export async function logCallStart(
    { cardName, usernames, host, guest }:
        { cardName: string, usernames: [string, string], host: string, guest: string }
): Promise<void> {

    lastCardName = cardName
    callStartTime = lastLogTime = getTimeInMinutes()
    cards = {}
    currentCallDocRef = await createCallDocRef(newCallLog({
        usernames,
        start_time: getFirebaseDate(),
        host,
        guest,
    }))

    logCurrentCallState()
    const loggerInterval = setInterval(() => {
        if (currentCallDocRef == null) {
            clearInterval(loggerInterval)
        }
        logCurrentCallState()
    }, 1000 * 60)
}

export function logCardSwitch(newCardName: string): void {
    logCurrentCallState(newCardName)

    lastCardName = newCardName
}

export async function logCallEnd(): Promise<void> {
    if (currentCallDocRef == null) return

    logCurrentCallState()

    currentCallDocRef = null
    cards = null
}

async function createCallDocRef(call: Partial<CallEntry>): Promise<DocumentReference> {
    try {
        return await addDoc(collection(getDb(), 'calls'), call)
    } catch (e) {
        console.error("error getting firebase database:", e)
        return null
    }
}

async function logCurrentCallState(newCardName?: string) {
    if (currentCallDocRef == null) return

    const lastCard = cards[lastCardName] ?? { duration: 0 }
    lastCard.duration += getTimeInMinutes() - lastLogTime
    cards[lastCardName] = lastCard

    if (newCardName != null && cards[newCardName] == null) {
        cards[newCardName] = { duration: 0 }
    }

    updateDoc(
        currentCallDocRef,
        {
            cards,
            end_time: getFirebaseDate(),
            duration: getTimeInMinutes() - callStartTime
        }
    )

    lastLogTime = getTimeInMinutes()
}

function getFirebaseDate() {
    return new Timestamp(getTimeInSeconds(), 0).toDate()
}

function getTimeInSeconds() {
    return (new Date()).getTime() / 1000
}

function getTimeInMinutes() {
    return getTimeInSeconds() / 60
}

function newCallLog(args: Partial<CallEntry>) {
    // don't log on dev or local...
    if (isDev || isLocal) return null

    return {
        environment: envName,
        cards: {},
        ...args,
    }
}
