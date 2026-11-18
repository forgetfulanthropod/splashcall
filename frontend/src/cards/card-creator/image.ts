/** Shrink a painted picture so it fits on the phone and in a call. */
export function shrinkDataUrl(dataUrl: string): Promise<string> {
    return new Promise(function (resolve) {
        if (typeof dataUrl !== 'string' || dataUrl.indexOf('data:image/') !== 0) {
            resolve('')
            return
        }
        const img = new Image()
        img.onload = function () {
            const maxEdge = 420
            const longest = Math.max(img.width, img.height, 1)
            const scale = Math.min(1, maxEdge / longest)
            const width = Math.max(1, Math.round(img.width * scale))
            const height = Math.max(1, Math.round(img.height * scale))
            const canvas = document.createElement('canvas')
            canvas.width = width
            canvas.height = height
            const ctx = canvas.getContext('2d')
            if (ctx == null) {
                resolve('')
                return
            }
            ctx.fillStyle = '#f4efe6'
            ctx.fillRect(0, 0, width, height)
            ctx.drawImage(img, 0, 0, width, height)
            try {
                resolve(canvas.toDataURL('image/jpeg', 0.72))
            } catch (err) {
                resolve('')
            }
        }
        img.onerror = function () { resolve('') }
        img.src = dataUrl
    })
}
