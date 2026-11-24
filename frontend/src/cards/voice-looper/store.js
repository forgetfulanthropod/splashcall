/**
 * Songs live in localStorage. Recorded audio lives in IndexedDB because a
 * loop is far bigger than the 5MB localStorage ceiling. Unchanged audio is
 * stored once and reference-counted.
 */

const { audioIdsOf, hashSamples, migrate } = require('./song')

const LIBRARY_KEY = 'splash-looper-songs'
const DB_NAME = 'splash-looper'
const DB_STORE = 'audio'

function openDb() {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('This browser cannot store loops.'))
            return
        }
        const request = indexedDB.open(DB_NAME, 1)
        request.onupgradeneeded = () => {
            const db = request.result
            if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE)
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
}

let dbPromise = null
function db() {
    if (dbPromise == null) dbPromise = openDb()
    return dbPromise
}

function requestDone(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
}

async function idbGet(id) {
    const database = await db()
    return requestDone(database.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(id))
}

async function idbPut(id, value) {
    const database = await db()
    return requestDone(database.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE).put(value, id))
}

async function idbDelete(id) {
    const database = await db()
    return requestDone(database.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE).delete(id))
}

function audioKey(samples, rate) {
    return hashSamples(samples) + 'r' + rate
}

async function rememberAudio(samples, rate) {
    const id = audioKey(samples, rate)
    const existing = await idbGet(id)
    const refs = (existing && existing.refs ? existing.refs : 0) + 1
    await idbPut(id, {
        samples: existing && existing.samples ? existing.samples : samples,
        rate,
        refs,
    })
    return id
}

async function recallAudio(id) {
    if (!id) return null
    const row = await idbGet(id)
    if (row == null || row.samples == null) return null
    const samples = row.samples instanceof Float32Array ? row.samples : Float32Array.from(row.samples)
    return { samples, rate: row.rate }
}

async function releaseAudio(id) {
    if (!id) return
    const row = await idbGet(id)
    if (row == null) return
    if ((row.refs || 1) <= 1) await idbDelete(id)
    else await idbPut(id, { samples: row.samples, rate: row.rate, refs: row.refs - 1 })
}

function readLibrary() {
    try {
        const raw = localStorage.getItem(LIBRARY_KEY)
        if (raw == null) return null
        return migrate(JSON.parse(raw))
    } catch (err) {
        return null
    }
}

function writeLibrary(library) {
    const json = JSON.stringify(library)
    try {
        localStorage.setItem(LIBRARY_KEY, json)
        return ''
    } catch (err) {
        return 'This phone is full. Delete an old revision or song.'
    }
}

/** Keep one stored copy per song that still points at the recording. */
async function retainAudio(previous, next) {
    const before = new Map()
    const after = new Map()
    previous.songs.forEach((song) => {
        audioIdsOf(song).forEach((id) => before.set(id, (before.get(id) || 0) + 1))
    })
    next.songs.forEach((song) => {
        audioIdsOf(song).forEach((id) => after.set(id, (after.get(id) || 0) + 1))
    })
    const ids = Array.from(before.keys()).concat(Array.from(after.keys()))
    const seen = {}
    for (let i = 0; i < ids.length; i++) {
        const id = ids[i]
        if (seen[id]) continue
        seen[id] = true
        const count = after.get(id) || 0
        const row = await idbGet(id)
        if (row == null) continue
        if (count <= 0) await idbDelete(id)
        else await idbPut(id, { samples: row.samples, rate: row.rate, refs: count })
    }
}

async function keepAwake() {
    try {
        if (navigator.storage && navigator.storage.persist) await navigator.storage.persist()
    } catch (err) { /* the browser may refuse; the data is still saved */ }
}

module.exports = {
    LIBRARY_KEY,
    rememberAudio,
    recallAudio,
    releaseAudio,
    readLibrary,
    writeLibrary,
    retainAudio,
    keepAwake,
}
