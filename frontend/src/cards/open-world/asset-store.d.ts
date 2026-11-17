export type AssetKind = 'spec' | 'texture' | 'placement' | 'bytes'

export type AssetRecord = {
    hash: string
    size: number
    kind: AssetKind | string
    data: string | Uint8Array
    createdAt: number
}

export type WorldSave = {
    id: string
    name: string
    savedAt: number
    specHash: string
    textureHash: string
    placementHash: string
    player: {
        x: number
        y: number
        z: number
        yaw: number
        health: number
    }
}

export type AssetStore = {
    putAsset(data: string | Uint8Array, kind: string): Promise<string>
    getAsset(hash: string): Promise<AssetRecord | null>
    totalBytes(): Promise<number>
    listSaves(): Promise<WorldSave[]>
    writeSave(save: WorldSave): Promise<unknown>
    deleteSave(id: string): Promise<unknown>
}

export function deviceStore(): Promise<AssetStore>
export function createAssetStore(db: unknown): AssetStore
export function memoryDb(): unknown
