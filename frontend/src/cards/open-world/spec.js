/**
 * Open World specs. Plain data: terrain, props, the player, one weapon, enemies.
 * The phone and the Vercel function both use this file. It does not call xAI
 * and it does not read an API key.
 */

const TEXTURE_SIZE = 256
const MAX_PROP_GROUPS = 6
const MAX_PROP_INSTANCES = 110
const MAX_ENEMY_KINDS = 3
const MAX_ENEMIES = 8
const MAX_NAME = 28

const PROP_ASSETS = [
    'CommonTree_1',
    'CommonTree_5',
    'Rock_Medium_1',
    'Rock_Medium_3',
    'Flower_4_Single',
    'Flower_3_Single',
    'Grass_Common_Short',
    'Clover_1',
]

const BIOMES = ['meadow', 'desert', 'snow', 'swamp', 'volcanic', 'beach']
const ACCESSORIES = ['none', 'hat', 'cape', 'horns', 'halo']
const WEAPONS = ['sword', 'staff', 'bow', 'blaster']
const BEHAVIORS = ['wander', 'chase', 'ranged']
const ENEMY_MODELS = ['character', 'procedural', 'rock']

const ASSET_INFO = {
    CommonTree_1: { minR: 6, maxR: 17.5, gap: 3.4, collide: 0.62, targetHeight: 6.4, castShadow: true },
    CommonTree_5: { minR: 5, maxR: 17.2, gap: 3.1, collide: 0.55, targetHeight: 5.6, castShadow: true },
    Rock_Medium_1: { minR: 3.5, maxR: 18.5, gap: 1.6, collide: 0.42, targetHeight: 0.85, castShadow: true },
    Rock_Medium_3: { minR: 4, maxR: 19, gap: 1.5, collide: 0.38, targetHeight: 0.7, castShadow: true },
    Flower_4_Single: { minR: 1.6, maxR: 16, gap: 0.7, collide: 0, targetHeight: 0.48, castShadow: false },
    Flower_3_Single: { minR: 1.8, maxR: 16.5, gap: 0.65, collide: 0, targetHeight: 0.42, castShadow: false },
    Grass_Common_Short: { minR: 1.2, maxR: 18, gap: 0.45, collide: 0, targetHeight: 0.55, castShadow: false },
    Clover_1: { minR: 1.2, maxR: 17, gap: 0.4, collide: 0, targetHeight: 0.28, castShadow: false },
}

const HEROES = [
    { re: /Tree/, x: 5.2, z: 1.6, yaw: 0.4 },
    { re: /Tree/, x: -6.4, z: 4.8, yaw: 1.2 },
    { re: /Rock/, x: 2.4, z: 3.6, yaw: 0.8 },
    { re: /Flower/, x: 1.5, z: 1.7, yaw: 0.2 },
    { re: /Grass|Clover|Flower/, x: 0.9, z: -1.5, yaw: 0.5 },
]

const NAMED_COLORS = {
    red: '#e23d3d',
    blue: '#3a78e0',
    green: '#2faf62',
    yellow: '#f2c14e',
    purple: '#8a4fd4',
    pink: '#f27cbf',
    orange: '#f08a2c',
    black: '#2b2b2b',
    white: '#f7f7f7',
    gold: '#e2b340',
    brown: '#8a5a32',
    teal: '#2aabb8',
}

const WORLD_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'biome', 'palette', 'sky', 'hills', 'props', 'player', 'weapon', 'enemies'],
    properties: {
        name: { type: 'string', maxLength: MAX_NAME },
        biome: { type: 'string', enum: BIOMES },
        palette: colorGroup(['low', 'high', 'rock', 'fog']),
        sky: colorGroup(['top', 'horizon', 'ground']),
        hills: { type: 'number', minimum: 0, maximum: 1 },
        props: {
            type: 'array',
            maxItems: MAX_PROP_GROUPS,
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['asset', 'count', 'scale'],
                properties: {
                    asset: { type: 'string', enum: PROP_ASSETS },
                    count: { type: 'integer', minimum: 0, maximum: 24 },
                    scale: { type: 'number', minimum: 0.45, maximum: 1.6 },
                },
            },
        },
        player: {
            type: 'object',
            additionalProperties: false,
            required: ['model', 'tint', 'scale', 'accessory'],
            properties: {
                model: { type: 'string', enum: ['character'] },
                tint: { type: 'string', maxLength: 16 },
                scale: { type: 'number', minimum: 0.75, maximum: 1.4 },
                accessory: { type: 'string', enum: ACCESSORIES },
            },
        },
        weapon: {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'damage', 'range', 'color'],
            properties: {
                type: { type: 'string', enum: WEAPONS },
                damage: { type: 'integer', minimum: 4, maximum: 24 },
                range: { type: 'number', minimum: 1.2, maximum: 14 },
                color: { type: 'string', maxLength: 16 },
            },
        },
        enemies: {
            type: 'array',
            maxItems: MAX_ENEMY_KINDS,
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['name', 'count', 'health', 'speed', 'behavior', 'model', 'tint', 'scale', 'damage'],
                properties: {
                    name: { type: 'string', maxLength: 18 },
                    count: { type: 'integer', minimum: 1, maximum: 4 },
                    health: { type: 'integer', minimum: 8, maximum: 60 },
                    speed: { type: 'number', minimum: 0.8, maximum: 4 },
                    behavior: { type: 'string', enum: BEHAVIORS },
                    model: { type: 'string', enum: ENEMY_MODELS },
                    tint: { type: 'string', maxLength: 16 },
                    scale: { type: 'number', minimum: 0.65, maximum: 1.7 },
                    damage: { type: 'integer', minimum: 3, maximum: 14 },
                },
            },
        },
    },
}

const WORLD_PROMPT = [
    'You design one small stylized outdoor world for a phone game called SplashCall.',
    'name is under 24 characters and fits the idea.',
    'biome is meadow, desert, snow, swamp, volcanic, or beach.',
    'palette and sky colors are hex, like #4e9a3c. low and high are the ground. rock is the rim. fog matches the distance.',
    'hills is 0 for nearly flat and 1 for rolling. Stay under 0.7 unless the idea is mountainous.',
    'props use only these assets: ' + PROP_ASSETS.join(', ') + '.',
    'Use 4 to 6 prop groups. Include ground cover (grass, clover, or flowers) and a couple of larger shapes.',
    'count is how many copies. scale is near 1.',
    'player.model is always character. tint is the body color. scale is near 1.',
    'accessory is none, hat, cape, horns, or halo. Pick one that fits.',
    'weapon.type is sword, staff, bow, or blaster. The mesh is built in code. Do not name a file.',
    'Sword and staff damage is 8 to 16 and range is about 2. Bow and blaster damage is 6 to 12 and range is 8 to 12.',
    'enemies: 1 or 2 kinds. count is 2 to 4. health is 12 to 40. speed is 1 to 3.',
    'behavior is wander, chase, or ranged. Give the player one kind that chases or shoots.',
    'model is procedural, rock, or character. Prefer procedural. Use character at most once.',
    'tint, scale near 1, damage 4 to 10.',
    'The game scatters props and enemies. You only choose counts and colors.',
    'No code, no URLs, no secrets.',
].join(' ')

function colorGroup(keys) {
    const properties = {}
    for (let i = 0; i < keys.length; i++) properties[keys[i]] = { type: 'string', maxLength: 16 }
    return {
        type: 'object',
        additionalProperties: false,
        required: keys.slice(),
        properties,
    }
}

function hashString(text) {
    let hash = 2166136261
    const value = String(text)
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i)
        hash = Math.imul(hash, 16777619)
    }
    return hash >>> 0
}

function mulberry32(seed) {
    let state = seed >>> 0
    return function rand() {
        state |= 0
        state = state + 0x6D2B79F5 | 0
        let t = Math.imul(state ^ state >>> 15, 1 | state)
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
        return ((t ^ t >>> 14) >>> 0) / 4294967296
    }
}

function clamp(value, min, max, fallback) {
    const number = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(number)) return fallback
    return Math.min(max, Math.max(min, number))
}

function clampInt(value, min, max, fallback) {
    return Math.round(clamp(value, min, max, fallback))
}

function cleanName(value, fallback) {
    const raw = typeof value === 'string' ? value : ''
    const text = raw.replace(/<[^>]*>/g, '').replace(/[<>&]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME)
    return text.length > 0 ? text : fallback
}

function cssColor(value, fallback) {
    if (value === 'keep') return 'keep'
    if (typeof value !== 'string') return fallback
    const text = value.trim().toLowerCase()
    if (/^#[0-9a-f]{3}$/.test(text)) {
        return '#' + text.charAt(1) + text.charAt(1) + text.charAt(2) + text.charAt(2) + text.charAt(3) + text.charAt(3)
    }
    if (/^#[0-9a-f]{6}$/.test(text)) return text
    if (/^#[0-9a-f]{8}$/.test(text)) return text.slice(0, 7)
    if (Object.prototype.hasOwnProperty.call(NAMED_COLORS, text)) return NAMED_COLORS[text]
    return fallback
}

function oneOf(list, value, fallback) {
    return list.indexOf(value) >= 0 ? value : fallback
}

function paletteOf(raw, fallback) {
    const source = raw && typeof raw === 'object' ? raw : {}
    return {
        low: cssColor(source.low, fallback.low),
        high: cssColor(source.high, fallback.high),
        rock: cssColor(source.rock, fallback.rock),
        fog: cssColor(source.fog, fallback.fog),
    }
}

function skyOf(raw, fallback) {
    const source = raw && typeof raw === 'object' ? raw : {}
    return {
        top: cssColor(source.top, fallback.top),
        horizon: cssColor(source.horizon, fallback.horizon),
        ground: cssColor(source.ground, fallback.ground),
    }
}

function defaultProps(biome) {
    if (biome === 'desert' || biome === 'volcanic' || biome === 'beach') {
        return [
            prop('Rock_Medium_1', 8, 1),
            prop('Rock_Medium_3', 6, 0.9),
            prop('CommonTree_5', 4, 0.85),
            prop('Grass_Common_Short', 10, 0.8),
        ]
    }
    if (biome === 'snow') {
        return [
            prop('CommonTree_1', 7, 1),
            prop('CommonTree_5', 5, 0.9),
            prop('Rock_Medium_1', 6, 0.9),
            prop('Clover_1', 8, 0.7),
        ]
    }
    return [
        prop('CommonTree_1', 8, 1),
        prop('CommonTree_5', 6, 0.95),
        prop('Rock_Medium_1', 6, 0.9),
        prop('Flower_4_Single', 10, 1),
        prop('Grass_Common_Short', 16, 1),
    ]
}

function prop(asset, count, scale) {
    return { asset, count, scale }
}

function sanitizeProps(value, biome) {
    const source = Array.isArray(value) ? value : []
    const props = []
    let instances = 0
    for (let i = 0; i < source.length && props.length < MAX_PROP_GROUPS; i++) {
        const item = source[i]
        if (item == null || typeof item !== 'object') continue
        if (PROP_ASSETS.indexOf(item.asset) < 0) continue
        let count = clampInt(item.count, 0, 24, 4)
        const room = MAX_PROP_INSTANCES - instances
        if (room <= 0) break
        if (count > room) count = room
        if (count === 0) continue
        instances += count
        props.push({
            asset: item.asset,
            count,
            scale: round3(clamp(item.scale, 0.45, 1.6, 1)),
        })
    }
    return props.length > 0 ? props : defaultProps(biome)
}

function sanitizeEnemies(value) {
    const source = Array.isArray(value) ? value : []
    const enemies = []
    let bodies = 0
    let characters = 0
    for (let i = 0; i < source.length && enemies.length < MAX_ENEMY_KINDS; i++) {
        const item = source[i]
        if (item == null || typeof item !== 'object') continue
        let model = oneOf(ENEMY_MODELS, item.model, 'procedural')
        if (model === 'character') {
            if (characters >= 1) model = 'procedural'
            else characters += 1
        }
        let count = clampInt(item.count, 1, 4, 2)
        if (model === 'character') count = Math.min(count, 3)
        const room = MAX_ENEMIES - bodies
        if (room <= 0) break
        if (count > room) count = room
        bodies += count
        const behavior = oneOf(BEHAVIORS, item.behavior, 'chase')
        enemies.push({
            name: cleanName(item.name, model === 'rock' ? 'Golem' : 'Critter'),
            count,
            health: clampInt(item.health, 8, 60, 20),
            speed: round3(clamp(item.speed, 0.8, 4, 1.8)),
            behavior,
            model,
            tint: cssColor(item.tint, '#c4523a'),
            scale: round3(clamp(item.scale, 0.65, 1.7, 1)),
            damage: clampInt(item.damage, 3, 14, 6),
        })
    }
    if (enemies.length === 0) {
        enemies.push({
            name: 'Critter',
            count: 3,
            health: 18,
            speed: 1.7,
            behavior: 'chase',
            model: 'procedural',
            tint: '#c4523a',
            scale: 1,
            damage: 6,
        })
    }
    return enemies
}

function sanitizeWeapon(value) {
    const source = value && typeof value === 'object' ? value : {}
    const type = oneOf(WEAPONS, source.type, 'sword')
    const ranged = type === 'bow' || type === 'blaster'
    return {
        type,
        damage: clampInt(source.damage, 4, 24, ranged ? 8 : 12),
        range: round3(ranged ? clamp(source.range, 6, 14, 10) : clamp(source.range, 1.2, 3.4, 2.1)),
        color: cssColor(source.color, ranged ? '#f2c14e' : '#d7dde6'),
    }
}

function sanitizePlayer(value) {
    const source = value && typeof value === 'object' ? value : {}
    return {
        model: 'character',
        tint: cssColor(source.tint, 'keep'),
        scale: round3(clamp(source.scale, 0.75, 1.4, 1)),
        accessory: oneOf(ACCESSORIES, source.accessory, 'none'),
    }
}

function sanitizeWorld(raw) {
    const source = raw && typeof raw === 'object' ? raw : {}
    const biome = oneOf(BIOMES, source.biome, 'meadow')
    const fallback = practiceTemplate(biome)
    return {
        name: cleanName(source.name, fallback.name),
        biome,
        palette: paletteOf(source.palette, fallback.palette),
        sky: skyOf(source.sky, fallback.sky),
        hills: round3(clamp(source.hills, 0, 1, fallback.hills)),
        props: sanitizeProps(source.props, biome),
        player: sanitizePlayer(source.player),
        weapon: sanitizeWeapon(source.weapon),
        enemies: sanitizeEnemies(source.enemies),
    }
}

function round3(value) {
    return Math.round(value * 1000) / 1000
}

function buildWorldChatRequest(idea) {
    return {
        model: 'grok-4.7',
        reasoning_effort: 'low',
        temperature: 0.7,
        max_tokens: 1800,
        messages: [
            { role: 'system', content: WORLD_PROMPT },
            { role: 'user', content: 'World:\n' + idea },
        ],
        response_format: {
            type: 'json_schema',
            json_schema: {
                name: 'splash_world',
                strict: true,
                schema: WORLD_SCHEMA,
            },
        },
    }
}

function practiceTemplate(biome) {
    if (biome === 'desert' || biome === 'beach' || biome === 'volcanic') return dunes()
    if (biome === 'snow') return frost()
    if (biome === 'swamp') return swamp()
    return meadow()
}

function meadow() {
    return {
        name: 'Meadow',
        biome: 'meadow',
        palette: { low: '#4e9a3c', high: '#8bc85a', rock: '#c6ae74', fog: '#d7eefc' },
        sky: { top: '#6eb6f5', horizon: '#e7f6ff', ground: '#d5e7b0' },
        hills: 0.35,
        props: [
            prop('CommonTree_1', 8, 1),
            prop('CommonTree_5', 6, 0.95),
            prop('Rock_Medium_1', 6, 0.9),
            prop('Flower_4_Single', 10, 1),
            prop('Grass_Common_Short', 16, 1),
        ],
        player: { model: 'character', tint: 'keep', scale: 1, accessory: 'none' },
        weapon: { type: 'sword', damage: 12, range: 2.1, color: '#d7dde6' },
        enemies: [
            {
                name: 'Sprout',
                count: 3,
                health: 18,
                speed: 1.7,
                behavior: 'chase',
                model: 'procedural',
                tint: '#d3553a',
                scale: 1,
                damage: 6,
            },
        ],
    }
}

function dunes() {
    return {
        name: 'Dunes',
        biome: 'desert',
        palette: { low: '#c4a15a', high: '#e6c98a', rock: '#a87848', fog: '#f3ddb0' },
        sky: { top: '#6aa7e8', horizon: '#ffe6b0', ground: '#e7c98a' },
        hills: 0.55,
        props: [
            prop('Rock_Medium_1', 9, 1.05),
            prop('Rock_Medium_3', 7, 0.9),
            prop('CommonTree_5', 4, 0.8),
            prop('Grass_Common_Short', 8, 0.7),
        ],
        player: { model: 'character', tint: '#e6b15a', scale: 1, accessory: 'hat' },
        weapon: { type: 'staff', damage: 14, range: 2.4, color: '#8a5a32' },
        enemies: [
            {
                name: 'Scarab',
                count: 3,
                health: 16,
                speed: 2.1,
                behavior: 'chase',
                model: 'procedural',
                tint: '#c47a2a',
                scale: 0.9,
                damage: 7,
            },
            {
                name: 'Spitter',
                count: 2,
                health: 14,
                speed: 1.3,
                behavior: 'ranged',
                model: 'procedural',
                tint: '#6a8f3a',
                scale: 1,
                damage: 5,
            },
        ],
    }
}

function frost() {
    return {
        name: 'Frost',
        biome: 'snow',
        palette: { low: '#d5e4ef', high: '#f4fbff', rock: '#9eb0c2', fog: '#e7f2fb' },
        sky: { top: '#8eb7e6', horizon: '#f7fbff', ground: '#d5e2ee' },
        hills: 0.42,
        props: [
            prop('CommonTree_1', 7, 1.05),
            prop('CommonTree_5', 5, 0.9),
            prop('Rock_Medium_1', 6, 0.85),
            prop('Clover_1', 8, 0.65),
        ],
        player: { model: 'character', tint: '#dfeaf5', scale: 1, accessory: 'cape' },
        weapon: { type: 'bow', damage: 9, range: 11, color: '#f2f6fb' },
        enemies: [
            {
                name: 'Wolf',
                count: 2,
                health: 28,
                speed: 2.6,
                behavior: 'chase',
                model: 'character',
                tint: '#6f8eae',
                scale: 1.05,
                damage: 8,
            },
        ],
    }
}

function swamp() {
    return {
        name: 'Swamp',
        biome: 'swamp',
        palette: { low: '#3e6a38', high: '#6e8f45', rock: '#6d6248', fog: '#c9d5b0' },
        sky: { top: '#8aa37a', horizon: '#e4efc8', ground: '#9aaa78' },
        hills: 0.22,
        props: [
            prop('CommonTree_5', 8, 1.1),
            prop('Rock_Medium_3', 5, 0.8),
            prop('Clover_1', 12, 1),
            prop('Grass_Common_Short', 12, 1.1),
        ],
        player: { model: 'character', tint: '#6a8f4a', scale: 1, accessory: 'none' },
        weapon: { type: 'blaster', damage: 8, range: 9, color: '#d2f26a' },
        enemies: [
            {
                name: 'Lurker',
                count: 3,
                health: 22,
                speed: 1.4,
                behavior: 'chase',
                model: 'procedural',
                tint: '#3f6b32',
                scale: 1.15,
                damage: 7,
            },
        ],
    }
}

function practiceWorlds() {
    return [clone(meadow()), clone(dunes()), clone(frost())]
}

function practiceWorldFor(idea) {
    const text = String(idea || '').toLowerCase()
    if (/snow|ice|frost|winter|frozen|tundra/.test(text)) return clone(frost())
    if (/desert|dune|sand|cactus|arid|beach|island|volcano|lava|ash/.test(text)) return clone(dunes())
    if (/swamp|bog|marsh|murk/.test(text)) return clone(swamp())
    if (/meadow|forest|grass|wood|garden|practice/.test(text) || text.trim().length === 0) return clone(meadow())
    const worlds = [meadow(), dunes(), frost()]
    return clone(worlds[hashString(text) % worlds.length])
}

function clone(value) {
    return JSON.parse(JSON.stringify(value))
}

function placementSeed(spec) {
    const parts = [spec.name, spec.biome, String(spec.hills)]
    for (let i = 0; i < spec.props.length; i++) {
        const propItem = spec.props[i]
        parts.push(propItem.asset + ':' + propItem.count + ':' + propItem.scale)
    }
    return hashString(parts.join('|'))
}

function tooClose(circles, x, z, gap) {
    for (let i = 0; i < circles.length; i++) {
        const circle = circles[i]
        const dx = x - circle.x
        const dz = z - circle.z
        const reach = gap + circle.r * 0.35
        if (dx * dx + dz * dz < reach * reach) return true
    }
    return false
}

function buildPlacements(spec) {
    const world = sanitizeWorld(spec)
    const rand = mulberry32(placementSeed(world) || 1)
    const occupied = [{ x: 0, z: 0, r: 2.6 }]
    const out = []
    const groups = world.props.map(function (item) {
        return { asset: item.asset, scale: item.scale, left: item.count }
    })
    for (let h = 0; h < HEROES.length; h++) {
        const hero = HEROES[h]
        let group = null
        for (let g = 0; g < groups.length; g++) {
            if (groups[g].left > 0 && hero.re.test(groups[g].asset)) {
                group = groups[g]
                break
            }
        }
        if (group == null) continue
        group.left -= 1
        out.push({ asset: group.asset, x: round3(hero.x), z: round3(hero.z), yaw: round3(hero.yaw), scale: group.scale })
        occupied.push({ x: hero.x, z: hero.z, r: ASSET_INFO[group.asset].gap })
    }
    for (let g = 0; g < groups.length; g++) {
        const group = groups[g]
        const info = ASSET_INFO[group.asset]
        let guard = 0
        while (group.left > 0 && guard < group.left * 40) {
            guard += 1
            const ang = rand() * Math.PI * 2
            const radius = info.minR + Math.sqrt(rand()) * (info.maxR - info.minR)
            const x = Math.cos(ang) * radius
            const z = Math.sin(ang) * radius
            if (tooClose(occupied, x, z, info.gap)) continue
            const scale = round3(group.scale * (1 + (rand() - 0.5) * 0.28))
            group.left -= 1
            out.push({
                asset: group.asset,
                x: round3(x),
                z: round3(z),
                yaw: round3(rand() * Math.PI * 2),
                scale: Math.min(1.8, Math.max(0.35, scale)),
            })
            occupied.push({ x, z, r: info.gap })
        }
    }
    return out
}

function sanitizePlacements(raw, spec) {
    if (!Array.isArray(raw)) return buildPlacements(spec)
    const out = []
    for (let i = 0; i < raw.length && out.length < MAX_PROP_INSTANCES; i++) {
        const item = raw[i]
        if (item == null || typeof item !== 'object') continue
        if (PROP_ASSETS.indexOf(item.asset) < 0) continue
        out.push({
            asset: item.asset,
            x: round3(clamp(item.x, -22, 22, 0)),
            z: round3(clamp(item.z, -22, 22, 0)),
            yaw: round3(clamp(item.yaw, -7, 7, 0)),
            scale: round3(clamp(item.scale, 0.35, 1.8, 1)),
        })
    }
    return out.length > 0 ? out : buildPlacements(spec)
}

function parseHex(color) {
    const text = cssColor(color, '#888888')
    const hex = text === 'keep' ? '#888888' : text
    return [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16),
    ]
}

function mixByte(a, b, t) {
    return Math.max(0, Math.min(255, Math.round(a + (b - a) * t)))
}

function buildGrassPixels(palette, seed) {
    const size = TEXTURE_SIZE
    const pixels = new Uint8Array(size * size * 4)
    const low = parseHex(palette && palette.low)
    const high = parseHex(palette && palette.high)
    const rand = mulberry32((seed || 1) >>> 0)
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const n = rand()
            const i = (y * size + x) * 4
            pixels[i] = mixByte(low[0], high[0], n)
            pixels[i + 1] = mixByte(low[1], high[1], n)
            pixels[i + 2] = mixByte(low[2], high[2], n)
            pixels[i + 3] = 255
        }
    }
    for (let blade = 0; blade < 700; blade++) {
        const x = (rand() * size) | 0
        const y = (rand() * size) | 0
        const dark = rand() > 0.45
        const color = dark
            ? [mixByte(low[0], 0, 0.25), mixByte(low[1], 0, 0.25), mixByte(low[2], 0, 0.25)]
            : [mixByte(high[0], 255, 0.25), mixByte(high[1], 255, 0.25), mixByte(high[2], 255, 0.25)]
        const len = 3 + ((rand() * 6) | 0)
        const drift = rand() > 0.5 ? 1 : -1
        for (let k = 0; k < len; k++) {
            const xx = (x + drift * (k > 2 ? 1 : 0) + size) % size
            const yy = (y - k + size) % size
            const i = (yy * size + xx) * 4
            pixels[i] = color[0]
            pixels[i + 1] = color[1]
            pixels[i + 2] = color[2]
        }
    }
    return pixels
}

function textureSeed(spec) {
    return hashString(JSON.stringify(sanitizeWorld(spec).palette)) || 1
}

module.exports = {
    TEXTURE_SIZE,
    MAX_ENEMIES,
    PROP_ASSETS,
    ASSET_INFO,
    WORLD_SCHEMA,
    WORLD_PROMPT,
    hashString,
    sanitizeWorld,
    buildWorldChatRequest,
    practiceWorlds,
    practiceWorldFor,
    buildPlacements,
    sanitizePlacements,
    buildGrassPixels,
    textureSeed,
}
