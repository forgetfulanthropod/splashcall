import { TEXTURE_SIZE } from './spec'

export type WorldArt = {
    ground?: string
    enemy?: string
    weapon?: string
}

export function acceptArt(value: unknown): WorldArt | null {
    if (value == null || typeof value !== 'object') return null
    const raw = value as Record<string, unknown>
    const art: WorldArt = {}
    const keys: Array<keyof WorldArt> = ['ground', 'enemy', 'weapon']
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i]
        const url = raw[key]
        if (typeof url === 'string' && url.indexOf('data:image/') === 0 && url.length < 3000000) {
            art[key] = url
        }
    }
    return art.ground || art.enemy || art.weapon ? art : null
}

/** Draw a generated ground picture into the world's repeating texture. */
export function imageToTexturePixels(dataUrl: string): Promise<Uint8Array | null> {
    return new Promise(function (resolve) {
        const img = new Image()
        img.onload = function () {
            const canvas = document.createElement('canvas')
            canvas.width = TEXTURE_SIZE
            canvas.height = TEXTURE_SIZE
            const ctx = canvas.getContext('2d')
            if (ctx == null) {
                resolve(null)
                return
            }
            ctx.drawImage(img, 0, 0, TEXTURE_SIZE, TEXTURE_SIZE)
            const data = ctx.getImageData(0, 0, TEXTURE_SIZE, TEXTURE_SIZE)
            resolve(new Uint8Array(data.data.buffer.slice(0)))
        }
        img.onerror = function () { resolve(null) }
        img.src = dataUrl
    })
}
