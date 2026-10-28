type Point = { x: number, y: number }

export function drawDot(ctx: CanvasRenderingContext2D, pos: Point, color = 'black', radius = 2): void {
    ctx.lineWidth = 1
    ctx.fillStyle = color
    ctx.strokeStyle = color
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2)
    ctx.closePath()
    ctx.stroke()
    ctx.fill()
}


export function drawArrow(ctx: CanvasRenderingContext2D, from: Point, to: Point, color = 'black'): void {
    ctx.lineWidth = 1
    ctx.strokeStyle = color
    ctx.beginPath()
    const headlen = 10 // length of head in pixels
    const dx = to.x - from.x
    const dy = to.y - from.y
    const angle = Math.atan2(dy, dx)
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.lineTo(to.x - headlen * Math.cos(angle - Math.PI / 6), to.y - headlen * Math.sin(angle - Math.PI / 6))
    ctx.moveTo(to.x, to.y)
    ctx.lineTo(to.x - headlen * Math.cos(angle + Math.PI / 6), to.y - headlen * Math.sin(angle + Math.PI / 6))
    ctx.closePath()
    ctx.stroke()
}
