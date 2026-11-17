export const TEXTURE_SIZE: number
export const MAX_ENEMIES: number
export const PROP_ASSETS: readonly string[]

export type PropAsset =
    | 'CommonTree_1'
    | 'CommonTree_5'
    | 'Rock_Medium_1'
    | 'Rock_Medium_3'
    | 'Flower_4_Single'
    | 'Flower_3_Single'
    | 'Grass_Common_Short'
    | 'Clover_1'

export type Biome = 'meadow' | 'desert' | 'snow' | 'swamp' | 'volcanic' | 'beach'
export type Accessory = 'none' | 'hat' | 'cape' | 'horns' | 'halo'
export type WeaponType = 'sword' | 'staff' | 'bow' | 'blaster'
export type EnemyBehavior = 'wander' | 'chase' | 'ranged'
export type EnemyModel = 'character' | 'procedural' | 'rock'

export type AssetInfo = {
    minR: number
    maxR: number
    gap: number
    collide: number
    targetHeight: number
    castShadow: boolean
}

export const ASSET_INFO: Record<PropAsset, AssetInfo>

export type Palette = { low: string, high: string, rock: string, fog: string }
export type SkyColors = { top: string, horizon: string, ground: string }

export type PropGroup = { asset: PropAsset, count: number, scale: number }

export type PlayerSpec = {
    model: 'character'
    tint: string
    scale: number
    accessory: Accessory
}

export type WeaponSpec = {
    type: WeaponType
    damage: number
    range: number
    color: string
}

export type EnemySpec = {
    name: string
    count: number
    health: number
    speed: number
    behavior: EnemyBehavior
    model: EnemyModel
    tint: string
    scale: number
    damage: number
}

export type WorldSpec = {
    name: string
    biome: Biome
    palette: Palette
    sky: SkyColors
    hills: number
    props: PropGroup[]
    player: PlayerSpec
    weapon: WeaponSpec
    enemies: EnemySpec[]
}

export type Placement = {
    asset: PropAsset
    x: number
    z: number
    yaw: number
    scale: number
}

export function sanitizeWorld(raw: unknown): WorldSpec
export function buildWorldChatRequest(idea: string): unknown
export function practiceWorlds(): WorldSpec[]
export function practiceWorldFor(idea: string): WorldSpec
export function buildPlacements(spec: WorldSpec): Placement[]
export function sanitizePlacements(raw: unknown, spec: WorldSpec): Placement[]
export function buildGrassPixels(palette: Palette, seed: number): Uint8Array
export function textureSeed(spec: WorldSpec): number
export function hashString(text: string): number
