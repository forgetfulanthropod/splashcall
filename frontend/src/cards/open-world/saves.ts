import { deviceStore, WorldSave } from './asset-store'
import {
    buildGrassPixels,
    buildPlacements,
    Placement,
    sanitizePlacements,
    sanitizeWorld,
    TEXTURE_SIZE,
    textureSeed,
    WorldSpec,
} from './spec'

export type PlayerState = {
    x: number
    y: number
    z: number
    yaw: number
    health: number
}

export type StoredWorld = {
    spec: WorldSpec
    pixels: Uint8Array
    placements: Placement[]
    hashes: { spec: string, texture: string, placement: string }
}

const TEXTURE_BYTES = TEXTURE_SIZE * TEXTURE_SIZE * 4

export async function rememberWorld(spec: WorldSpec): Promise<StoredWorld> {
    const clean = sanitizeWorld(spec)
    const pixels = buildGrassPixels(clean.palette, textureSeed(clean))
    const placements = buildPlacements(clean)
    const store = await deviceStore()
    const specHash = await store.putAsset(JSON.stringify(clean), 'spec')
    const textureHash = await store.putAsset(pixels, 'texture')
    const placementHash = await store.putAsset(JSON.stringify(placements), 'placement')
    return {
        spec: clean,
        pixels,
        placements,
        hashes: { spec: specHash, texture: textureHash, placement: placementHash },
    }
}

export async function writeWorldSave(spec: WorldSpec, player: PlayerState): Promise<WorldSave> {
    const stored = await rememberWorld(spec)
    const save: WorldSave = {
        id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
        name: stored.spec.name,
        savedAt: Date.now(),
        specHash: stored.hashes.spec,
        textureHash: stored.hashes.texture,
        placementHash: stored.hashes.placement,
        player: {
            x: player.x,
            y: player.y,
            z: player.z,
            yaw: player.yaw,
            health: Math.max(1, Math.min(100, Math.round(player.health))),
        },
    }
    const store = await deviceStore()
    await store.writeSave(save)
    return save
}

export async function listWorldSaves(): Promise<WorldSave[]> {
    const store = await deviceStore()
    return store.listSaves()
}

export async function removeWorldSave(id: string): Promise<void> {
    const store = await deviceStore()
    await store.deleteSave(id)
}

export async function assetStoreBytes(): Promise<number> {
    const store = await deviceStore()
    return store.totalBytes()
}

export async function loadWorldSave(save: WorldSave): Promise<{ spec: WorldSpec, player: PlayerState, pixels: Uint8Array, placements: Placement[] }> {
    const store = await deviceStore()
    const specAsset = await store.getAsset(save.specHash)
    if (specAsset == null || typeof specAsset.data !== 'string') {
        throw new Error('That save’s world data is missing from this device.')
    }
    const spec = sanitizeWorld(JSON.parse(specAsset.data))
    const textureAsset = await store.getAsset(save.textureHash)
    const texture = textureAsset != null && textureAsset.data instanceof Uint8Array
        && textureAsset.data.byteLength === TEXTURE_BYTES
        ? textureAsset.data
        : buildGrassPixels(spec.palette, textureSeed(spec))
    const placementAsset = await store.getAsset(save.placementHash)
    let placements = buildPlacements(spec)
    if (placementAsset != null && typeof placementAsset.data === 'string') {
        try {
            placements = sanitizePlacements(JSON.parse(placementAsset.data), spec)
        } catch (err) {
            placements = buildPlacements(spec)
        }
    }
    return {
        spec,
        pixels: texture,
        placements,
        player: {
            x: save.player.x,
            y: save.player.y,
            z: save.player.z,
            yaw: save.player.yaw,
            health: save.player.health,
        },
    }
}

export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB'
    if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}
