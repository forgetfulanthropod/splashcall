/** Per-channel distance that still counts as the clicked color.
 *  Small on purpose: antialiased brush edges differ by more than this and stay
 *  boundaries, while a little flat-color noise does not punch holes in a fill.
 */
export const BUCKET_TOLERANCE = 18

/**
 * 4-connected flood fill. Recolors only the region connected to (x, y).
 * Returns false when nothing changes (out of bounds, or the pixel is already
 * within tolerance of the fill color).
 */
export function floodFill(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    x: number,
    y: number,
    fill: readonly [number, number, number],
    tolerance: number = BUCKET_TOLERANCE,
): boolean {
    if (x < 0 || y < 0 || x >= width || y >= height) return false

    const start = (y * width + x) * 4
    const targetR = data[start]
    const targetG = data[start + 1]
    const targetB = data[start + 2]
    const [fillR, fillG, fillB] = fill

    if (
        Math.abs(targetR - fillR) <= tolerance &&
        Math.abs(targetG - fillG) <= tolerance &&
        Math.abs(targetB - fillB) <= tolerance
    ) {
        return false
    }

    const matches = (pixel: number): boolean => {
        const i = pixel * 4
        return Math.abs(data[i] - targetR) <= tolerance &&
            Math.abs(data[i + 1] - targetG) <= tolerance &&
            Math.abs(data[i + 2] - targetB) <= tolerance
    }

    // Scanline fill paints each matching pixel once. The replacement color is
    // outside tolerance of the target, so painted pixels are not matched again.
    const stack: number[] = [x, y]
    let guard = width * height
    while (stack.length > 0 && guard > 0) {
        const sy = stack.pop() as number
        let sx = stack.pop() as number
        while (sx >= 0 && matches(sy * width + sx)) sx -= 1
        sx += 1

        let spanAbove = false
        let spanBelow = false
        while (sx < width && matches(sy * width + sx)) {
            const i = (sy * width + sx) * 4
            data[i] = fillR
            data[i + 1] = fillG
            data[i + 2] = fillB
            data[i + 3] = 255
            guard -= 1

            if (sy > 0) {
                const above = matches((sy - 1) * width + sx)
                if (!spanAbove && above) {
                    stack.push(sx, sy - 1)
                    spanAbove = true
                } else if (spanAbove && !above) {
                    spanAbove = false
                }
            }
            if (sy + 1 < height) {
                const below = matches((sy + 1) * width + sx)
                if (!spanBelow && below) {
                    stack.push(sx, sy + 1)
                    spanBelow = true
                } else if (spanBelow && !below) {
                    spanBelow = false
                }
            }
            sx += 1
        }
    }

    return true
}
