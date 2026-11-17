const assert = require('assert')
const test = require('node:test')
const {
    buildGrassPixels,
    buildPlacements,
    buildWorldChatRequest,
    practiceWorldFor,
    practiceWorlds,
    sanitizeWorld,
    TEXTURE_SIZE,
} = require('../src/cards/open-world/spec')
const { createWorldFromIdea, createRateLimiter } = require('./world')
const { createAssetStore, memoryDb } = require('../src/cards/open-world/asset-store')
const { collectBuildEnv, all_keys } = require('../esbuild')
const cardHandler = require('../api/imagine')
const worldHandler = require('../api/imagine-world')

function mockRes() {
    return {
        statusCode: 0,
        body: undefined,
        headers: {},
        setHeader(name, value) { this.headers[name.toLowerCase()] = value },
        status(code) { this.statusCode = code; return this },
        json(body) { this.body = body; return this },
        end() { return this },
    }
}

test('practice worlds are safe to render and stay the same after a second pass', function () {
    const worlds = practiceWorlds()
    assert.equal(worlds.length, 3)
    assert.deepEqual(worlds.map(world => world.name), ['Meadow', 'Dunes', 'Frost'])
    for (let i = 0; i < worlds.length; i++) {
        const again = sanitizeWorld(worlds[i])
        assert.deepEqual(again, worlds[i])
        assert.ok(again.enemies.length >= 1)
        assert.equal(again.player.model, 'character')
        const bodies = again.enemies.reduce((sum, enemy) => sum + enemy.count, 0)
        assert.ok(bodies <= 8)
        const spots = buildPlacements(again)
        assert.ok(spots.length > 8)
        for (let s = 0; s < spots.length; s++) {
            assert.ok(Math.hypot(spots[s].x, spots[s].z) < 23)
        }
        const pixels = buildGrassPixels(again.palette, 3)
        assert.equal(pixels.length, TEXTURE_SIZE * TEXTURE_SIZE * 4)
        assert.equal(pixels[3], 255)
        const againPixels = buildGrassPixels(again.palette, 3)
        assert.equal(Buffer.from(pixels).equals(Buffer.from(againPixels)), true)
    }
})

test('a wild model payload is clamped and an offline idea picks a built-in world', function () {
    const world = sanitizeWorld({
        name: '<b>Lava pit</b>',
        biome: 'nope',
        hills: 9,
        palette: { low: 'red', high: '#abc', rock: 'not-a-color', fog: '#11223344' },
        props: [
            { asset: '../secret.glb', count: 100, scale: 9 },
            { asset: 'Rock_Medium_1', count: 100, scale: 0.1 },
        ],
        player: { model: 'dragon', tint: 'blue', scale: 8, accessory: 'jetpack' },
        weapon: { type: 'rocket', damage: 500, range: 100, color: 'gold' },
        enemies: [
            { name: 'A', count: 40, health: 999, speed: 20, behavior: 'fly', model: 'character', tint: '#fff', scale: 9, damage: 80 },
            { name: 'B', count: 9, health: 1, speed: 0, behavior: 'ranged', model: 'character', tint: 'purple', scale: 1, damage: 1 },
        ],
    })
    assert.equal(world.name, 'Lava pit')
    assert.equal(world.biome, 'meadow')
    assert.equal(world.hills, 1)
    assert.equal(world.palette.low, '#e23d3d')
    assert.equal(world.palette.high, '#aabbcc')
    assert.equal(world.palette.fog, '#112233')
    assert.equal(world.props.some(prop => prop.asset.indexOf('secret') >= 0), false)
    assert.ok(world.props[0].count <= 24)
    assert.equal(world.player.model, 'character')
    assert.equal(world.player.accessory, 'none')
    assert.equal(world.player.tint, '#3a78e0')
    assert.ok(world.player.scale <= 1.4)
    assert.equal(world.weapon.type, 'sword')
    assert.ok(world.weapon.damage <= 24)
    assert.ok(world.weapon.range <= 3.4)
    const bodies = world.enemies.reduce((sum, enemy) => sum + enemy.count, 0)
    assert.ok(bodies <= 8)
    assert.equal(world.enemies.filter(enemy => enemy.model === 'character').length, 1)
    assert.equal(practiceWorldFor('a frozen lake').name, 'Frost')
    assert.equal(practiceWorldFor('sand dunes at noon').biome, 'desert')
    assert.equal(practiceWorldFor('').name, 'Meadow')
})

test('the world chat request is structured JSON and carries no key', function () {
    const body = buildWorldChatRequest('a quiet beach')
    assert.equal(body.model, 'grok-4.7')
    assert.equal(body.reasoning_effort, 'low')
    assert.equal(body.response_format.type, 'json_schema')
    assert.equal(body.response_format.json_schema.strict, true)
    assert.equal(body.response_format.json_schema.schema.additionalProperties, false)
    assert.ok(body.max_tokens <= 1800)
    const encoded = JSON.stringify(body)
    assert.equal(encoded.includes('Bearer'), false)
    assert.equal(encoded.includes('XAI_API_KEY'), false)
    assert.equal(encoded.includes('sk-'), false)
})

test('mock worlds do not call xAI and a noisy caller is limited', async function () {
    let called = false
    const result = await createWorldFromIdea('a red desert', {
        apiKey: '',
        fetchImpl: function () { called = true },
        limiter: createRateLimiter(),
        ip: '10.9.0.1',
    })
    assert.equal(called, false)
    assert.equal(result.status, 200)
    assert.equal(result.body.mock, true)
    assert.equal(result.body.world.biome, 'desert')
    assert.equal(JSON.stringify(result).includes('sk-'), false)

    const limiter = createRateLimiter()
    for (let i = 0; i < 8; i++) {
        const ok = await createWorldFromIdea('a meadow', { apiKey: '', limiter, ip: '10.9.0.2' })
        assert.equal(ok.status, 200)
    }
    const blocked = await createWorldFromIdea('a meadow', { apiKey: '', limiter, ip: '10.9.0.2' })
    assert.equal(blocked.status, 429)
    const empty = await createWorldFromIdea('   ', { apiKey: '', limiter: createRateLimiter(), ip: '10.9.0.3' })
    assert.equal(empty.status, 400)
})

test('a model world is sanitized and the key is not echoed', async function () {
    const secret = 'sk-test-secret-value'
    const payload = practiceWorldFor('snow')
    payload.player.tint = 'teal'
    const result = await createWorldFromIdea('snow', {
        apiKey: secret,
        limiter: createRateLimiter(),
        ip: '10.9.0.4',
        fetchImpl: async function () {
            return {
                ok: true,
                text: async function () {
                    return JSON.stringify({
                        choices: [{ message: { content: JSON.stringify(payload) } }],
                    })
                },
            }
        },
    })
    assert.equal(result.status, 200)
    assert.equal(result.body.mock, false)
    assert.equal(result.body.world.player.tint, '#2aabb8')
    assert.equal(JSON.stringify(result).includes(secret), false)

    const failed = await createWorldFromIdea('snow', {
        apiKey: secret,
        limiter: createRateLimiter(),
        ip: '10.9.0.5',
        fetchImpl: async function () { throw new Error('connect ' + secret + ' refused') },
    })
    assert.equal(failed.status, 502)
    assert.equal(JSON.stringify(failed).includes(secret), false)
})

test('assets are stored once by hash and deleting a save keeps them', async function () {
    const store = createAssetStore(memoryDb())
    const first = await store.putAsset('{"name":"Meadow"}', 'spec')
    const second = await store.putAsset('{"name":"Meadow"}', 'spec')
    assert.equal(first, second)
    const texture = new Uint8Array([1, 2, 3, 4])
    const textureHash = await store.putAsset(texture, 'texture')
    assert.notEqual(textureHash, first)
    const bytes = await store.totalBytes()
    assert.equal(bytes, Buffer.byteLength('{"name":"Meadow"}') + 4)
    await store.writeSave({
        id: 's1',
        name: 'Meadow',
        savedAt: 10,
        specHash: first,
        textureHash,
        placementHash: first,
        player: { x: 1, y: 0, z: 2, yaw: 0.2, health: 80 },
    })
    await store.writeSave({
        id: 's2',
        name: 'Meadow again',
        savedAt: 20,
        specHash: first,
        textureHash,
        placementHash: first,
        player: { x: 0, y: 0, z: 0, yaw: 0, health: 100 },
    })
    const saves = await store.listSaves()
    assert.equal(saves[0].id, 's2')
    assert.equal(saves[0].specHash, first)
    await store.deleteSave('s2')
    assert.equal((await store.listSaves()).length, 1)
    assert.equal(await store.totalBytes(), bytes)
    const kept = await store.getAsset(textureHash)
    assert.equal(kept.size, 4)
    assert.equal(kept.data[0], 1)
})

test('esbuild reads REACT_APP_* from the environment and lists the imagine URL', function () {
    assert.equal(all_keys.includes('REACT_APP_IMAGINE_URL'), true)
    const merged = collectBuildEnv(
        { REACT_APP_IMAGINE_URL: 'from-file', REACT_APP_BACKEND_URL: 'from-file', ESBUILD_NODE_ENV: 'production' },
        { REACT_APP_IMAGINE_URL: 'from-shell', REACT_APP_OTHER: 'also-shell' },
        all_keys
    )
    assert.equal(merged.REACT_APP_IMAGINE_URL, 'from-shell')
    assert.equal(merged.REACT_APP_BACKEND_URL, 'from-file')
    assert.equal(merged.REACT_APP_OTHER, 'also-shell')
    assert.equal(merged.ESBUILD_NODE_ENV, 'production')
})

test('vercel card and world routes share the limits and hide the key', async function () {
    const previous = process.env.XAI_API_KEY
    process.env.XAI_API_KEY = ''
    try {
        const health = mockRes()
        await cardHandler({ method: 'GET', headers: {} }, health)
        assert.equal(health.statusCode, 200)
        assert.equal(health.body.mock, true)
        assert.equal(health.body.model, 'grok-4.7')
        assert.equal(JSON.stringify(health.body).toLowerCase().includes('key'), false)

        const created = mockRes()
        await cardHandler({
            method: 'POST',
            headers: { 'content-length': '28', 'x-forwarded-for': '10.8.0.1' },
            body: { idea: 'a red balloon' },
        }, created)
        assert.equal(created.statusCode, 200)
        assert.equal(created.body.creation.kind, 'object')

        const world = mockRes()
        await worldHandler({
            method: 'POST',
            headers: { 'x-forwarded-for': '10.8.0.2' },
            body: { idea: 'ice caves' },
        }, world)
        assert.equal(world.statusCode, 200)
        assert.equal(world.body.world.biome, 'snow')
        assert.equal(world.body.mock, true)

        const huge = mockRes()
        await worldHandler({
            method: 'POST',
            headers: { 'content-length': String(9 * 1024), 'x-forwarded-for': '10.8.0.3' },
            body: { idea: 'a meadow' },
        }, huge)
        assert.equal(huge.statusCode, 413)

        const bad = mockRes()
        await cardHandler({
            method: 'POST',
            headers: { 'x-forwarded-for': '10.8.0.4' },
            body: '{',
        }, bad)
        assert.equal(bad.statusCode, 400)
    } finally {
        if (previous == null) delete process.env.XAI_API_KEY
        else process.env.XAI_API_KEY = previous
    }
})
