/**
 * Content-addressed store for generated worlds.
 * Assets are keyed by SHA-256 and are never deleted. A save only stores the
 * hashes plus the player's position and health. IndexedDB is the device
 * backend. Tests use the memory backend, which follows the same rules.
 */

const textEncoder = new TextEncoder()

function toBytes(data) {
    if (typeof data === 'string') return textEncoder.encode(data)
    if (data instanceof Uint8Array) return data
    throw new Error('An asset has to be text or bytes.')
}

async function sha256Hex(bytes) {
    const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    const digest = await crypto.subtle.digest('SHA-256', copy)
    const view = new Uint8Array(digest)
    let hex = ''
    for (let i = 0; i < view.length; i++) hex += view[i].toString(16).padStart(2, '0')
    return hex
}

function createAssetStore(db) {
    return {
        async putAsset(data, kind) {
            const bytes = toBytes(data)
            const hash = await sha256Hex(bytes)
            const existing = await db.getAsset(hash)
            if (existing != null) return hash
            const record = {
                hash,
                size: bytes.byteLength,
                kind: kind || 'bytes',
                data: typeof data === 'string' ? data : bytes,
                createdAt: Date.now(),
            }
            try {
                await db.addAsset(record)
            } catch (err) {
                const again = await db.getAsset(hash)
                if (again == null) throw err
            }
            return hash
        },
        getAsset(hash) {
            return db.getAsset(hash)
        },
        async totalBytes() {
            const assets = await db.allAssets()
            let total = 0
            for (let i = 0; i < assets.length; i++) total += assets[i].size || 0
            return total
        },
        async listSaves() {
            const saves = await db.allSaves()
            saves.sort(function (a, b) { return b.savedAt - a.savedAt })
            return saves
        },
        writeSave(save) {
            return db.putSave(save)
        },
        deleteSave(id) {
            return db.deleteSave(id)
        },
    }
}

function memoryDb() {
    const assets = new Map()
    const saves = new Map()
    return {
        async getAsset(hash) { return assets.get(hash) || null },
        async addAsset(record) {
            if (assets.has(record.hash)) {
                const error = new Error('exists')
                error.name = 'ConstraintError'
                throw error
            }
            assets.set(record.hash, record)
        },
        async allAssets() { return Array.from(assets.values()) },
        async allSaves() { return Array.from(saves.values()) },
        async putSave(save) { saves.set(save.id, save) },
        async deleteSave(id) { saves.delete(id) },
    }
}

function openIndexedDb() {
    return new Promise(function (resolve, reject) {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('This browser blocked local saves.'))
            return
        }
        const request = indexedDB.open('splashcall-assets', 1)
        request.onupgradeneeded = function () {
            const db = request.result
            if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets', { keyPath: 'hash' })
            if (!db.objectStoreNames.contains('saves')) db.createObjectStore('saves', { keyPath: 'id' })
        }
        request.onsuccess = function () { resolve(request.result) }
        request.onerror = function () { reject(request.error || new Error('Could not open saves.')) }
    })
}

function requestToPromise(request) {
    return new Promise(function (resolve, reject) {
        request.onsuccess = function () { resolve(request.result) }
        request.onerror = function () { reject(request.error) }
    })
}

function idbBackend(db) {
    function run(storeName, mode, fn) {
        const tx = db.transaction(storeName, mode)
        const store = tx.objectStore(storeName)
        return fn(store)
    }
    return {
        getAsset(hash) {
            return run('assets', 'readonly', function (store) { return requestToPromise(store.get(hash)) })
                .then(function (row) { return row || null })
        },
        addAsset(record) {
            return run('assets', 'readwrite', function (store) { return requestToPromise(store.add(record)) })
        },
        allAssets() {
            return run('assets', 'readonly', function (store) { return requestToPromise(store.getAll()) })
        },
        allSaves() {
            return run('saves', 'readonly', function (store) { return requestToPromise(store.getAll()) })
        },
        putSave(save) {
            return run('saves', 'readwrite', function (store) { return requestToPromise(store.put(save)) })
        },
        deleteSave(id) {
            return run('saves', 'readwrite', function (store) { return requestToPromise(store.delete(id)) })
        },
    }
}

let devicePromise = null

function deviceStore() {
    if (devicePromise == null) {
        devicePromise = openIndexedDb().then(function (db) {
            return createAssetStore(idbBackend(db))
        })
    }
    return devicePromise
}

module.exports = {
    sha256Hex,
    toBytes,
    createAssetStore,
    memoryDb,
    deviceStore,
}
