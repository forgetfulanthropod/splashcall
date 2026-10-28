import { hexToHsv, hsvToHex } from '../../lib/colorUtils'
import { clamp } from '../../utils'
import { Circle as JellyCircle, Vec } from './jelly'
import { defaultMonsterSettings, defaultTentacleSettings, MonsterSettings, TentacleSettings } from './settings'
import { random } from "../../utils"
import { drawDot } from "../canvasUtils"

interface Point { x: number, y: number }
const HALF_PI = Math.PI / 2
const TWO_PI = Math.PI * 2


export interface Monster {
    update(millis: number, touchPoint?: Point): void
    drawStart(): void
    drawTentacle(): void
    drawFinish(): void
    center: Point
}

function getX(p: Point | Vec): number {
    return Array.isArray(p) ? p[0] : p.x
}
function getY(p: Point | Vec): number {
    return Array.isArray(p) ? p[0] : p.x
}

function toPoint(p: Vec | Point) {
    return Array.isArray(p) ? { x: p[0], y: p[1] } : p
}

function toVec(p: Point): Vec {
    return [p.x, p.y]
}


export function makeMonster(args: {
    center?: Point
    jellyCircle?: JellyCircle
    otherCenter?: Point
    ctx: CanvasRenderingContext2D
    settings: TentacleSettings
    monsterSettings: MonsterSettings
}): Monster {
    const { jellyCircle, otherCenter, ctx, settings, monsterSettings } = args
    if ((jellyCircle == null) == (args.center == null)) { // xnor
        throw Error("either jellyCircle or center must be given")
    }
    if (args.center != null && otherCenter == null) {
        throw Error("otherCenter must be specified if center is")
    }
    const isJelly = jellyCircle != null
    const center = jellyCircle != null ? toPoint(jellyCircle.centerPoint.pos) : args.center as Point
    // const initialCenter = { ...center }
    const radius = monsterSettings.headRadius
    const tentacles: Tentacle[] = []

    function addTentacle() {
        const t = makeTentacle({
            length: random(10, 20),
            radius: random(0.05, 1.0),
            spacing: random(0.2, 1.0),
            friction: random(0.7, 0.88),
            settings,
            monsterSettings
        })
        t.move(getX(center), getY(center), true)
        tentacles.push(t)
    }

    let color = hexToHsv(monsterSettings.color)
    let tentacleDrawIndex = 0
    let touchPoint: Point | undefined = null
    let lastTouched = Date.now() - 2000
    const simpleVel = { x: 0, y: 0 }
    return {
        center, // TODO: this won't update with time
        update(millis, newTouchPoint?) {
            if (isJelly) {
                const v = jellyCircle.centerPoint.pos
                center.x = v[0]
                center.y = v[1]
            }
            const speed = settings.drawer.speed.value
            touchPoint = newTouchPoint
            if (monsterSettings.tentacles != tentacles.length) {
                while (monsterSettings.tentacles > tentacles.length) {
                    addTentacle()
                }
                while (monsterSettings.tentacles < tentacles.length) {
                    tentacles.pop()
                }
            }
            // if (monsterSettings.pulse) {
            //     const t = millis * 0.001
            //     const pulse = Math.pow(Math.sin(t * Math.PI), 18)
            //     // const pulse = 1
            //     radius = monsterSettings.headRadius * 0.5 + monsterSettings.headRadius * 0.5 * pulse
            //     const scale = (radius + monsterSettings.thickness) / (monsterSettings.headRadius + monsterSettings.thickness)
            //     if (isJelly) {
            //         for (const p of jellyCircle.points) {
            //             p.spacing = p.initialSpacing * scale
            //         }
            //         for (const c of jellyCircle.constraints) {
            //             c[2].length = c[4] * scale
            //         }
            //     }
            // }
            if (touchPoint != null) {
                lastTouched = Date.now()
                // const s = 1 / 5 + speed / 5
                if (isJelly) {
                    const s = 0.01 + 0.01 * speed
                    jellyCircle.moveTowards(toVec(touchPoint), s)
                } else {
                    const s = 0.1
                    simpleVel.x = clamp((touchPoint.x - center.x) * s, -50, 50)
                    simpleVel.y = clamp((touchPoint.y - center.y) * s, -50, 50)
                }

            } else if (settings.drawer.hasAutoMode.value && Date.now() - lastTouched > 2000) {
                const [cx, cy] = [ctx.canvas.width / 2, ctx.canvas.height / 2]
                // jellyCircle.moveTowards({ x: cx, y: cy }, speed * 0.0001)
                const t = millis
                const goalVec: Vec = [
                    cx + Math.sin(t * 0.0002) * Math.cos(t * 0.00005) * cx,
                    cy + Math.sin(t * 0.003) * Math.tan(Math.sin(t * 0.0003) * 1.15) * cy * .4
                ]
                drawDot(ctx, toPoint(goalVec), 'white')
                if (isJelly) {
                    const s = speed * 0.0005
                    // jellyCircle.moveTowards(goalVec, s)
                    jellyCircle.addForce(Vec.muln(Vec.sub(goalVec, jellyCircle.centerPoint.pos), s))
                } else {
                    const s = 0.1
                    simpleVel.x = (goalVec[0] - getX(center)) * s
                    simpleVel.y = (goalVec[1] - getY(center)) * s
                }
            }

            if (!isJelly) {
                center.x += simpleVel.x
                center.y += simpleVel.y
                const minDistance = 2 * (radius + monsterSettings.thickness) * 0.8
                const overlap = calcOverlap(center, minDistance, otherCenter)
                if (overlap != null) {
                    simpleVel.x -= overlap.x * .1
                    simpleVel.y -= overlap.y * .1
                    center.x += simpleVel.x
                    center.y += simpleVel.y
                }
                simpleVel.x *= (1 - (0.01 + settings.drawer.friction.value))
                simpleVel.y *= (1 - (0.01 + settings.drawer.friction.value))
                if (center.x < 0) { simpleVel.x += 1 }
                if (center.x > ctx.canvas.width) { simpleVel.x -= 1 }
                if (center.y < 0) { simpleVel.y += 1 }
                if (center.y > ctx.canvas.height) { simpleVel.y -= 1 }
                // center.x = clamp(center.x, 0, ctx.canvas.width)
                // center.y = clamp(center.y, 0, ctx.canvas.height)
            }
            const step = TWO_PI / monsterSettings.tentacles
            for (let i = 0; i < monsterSettings.tentacles; i++) {
                const tentacle = tentacles[i]
                const theta = i * step
                const px = Math.cos(theta) * radius
                const py = Math.sin(theta) * radius
                tentacle.move(center.x + px, center.y + py)
                tentacle.update()
            }
            if (isJelly) {
                const v = jellyCircle.centerPoint.pos
                v[0] = center.x
                v[1] = center.y
            }
        },

        drawStart() {
            // if (!isJelly) {
            const c = hexToHsv(monsterSettings.color)
            color = { h: c.h * 0.95, s: c.s * 0.95, v: c.v * 0.95 }
            const w = clamp(color.v + (isDark(settings) ? -10 : 10), 0, 100)
            ctx.beginPath()
            ctx.arc(center.x, center.y, radius + monsterSettings.thickness, 0, TWO_PI)
            ctx.lineWidth = monsterSettings.headRadius * 0.5
            ctx.globalAlpha = 0.2
            ctx.strokeStyle = hsvToHex({ h: color.h, s: color.s, v: w })
            ctx.stroke()
            ctx.globalAlpha = 1.0
            // }
            tentacleDrawIndex = 0
        },
        drawTentacle() {
            tentacles[tentacleDrawIndex]?.draw(ctx)
            tentacleDrawIndex += 1
        },
        drawFinish() {
            if (!isJelly) {
                ctx.beginPath()
                ctx.arc(center.x, center.y, radius + monsterSettings.thickness, 0, TWO_PI)
                ctx.fillStyle = hsvToHex(color)
                ctx.fill()
            }
            if (touchPoint != null) {
                ctx.beginPath()
                // ctx.moveTo(touchpoint.x, touchpoint.y)
                ctx.arc(touchPoint.x, touchPoint.y, 10, 0, 2 * Math.PI)
                ctx.fillStyle = 'black'
                ctx.fill()
            }
        },
    }
}
function isDark(settings: TentacleSettings) {
    return hexToHsv(settings.drawer.colors.value[2]).v < 40
}
interface Tentacle {
    draw: (ctx: CanvasRenderingContext2D) => void
    update: () => void
    move: (x: number, y: number, instant?: boolean) => void
}
function makeTentacle({ length = 10, radius = 10, spacing = 20, friction = 0.8, settings = defaultTentacleSettings, monsterSettings = defaultMonsterSettings }): Tentacle {
    const shade = random(0.85, 1.1)
    const nodes: Node[] = []
    const outer: Point[] = []
    const inner: Point[] = []
    const theta: number[] = []

    for (let i = 0; i < length; i++) {
        nodes.push(makeNode())
    }

    return {
        move(x, y, instant = false) {
            nodes[0].x = x
            nodes[0].y = y
            if (instant) {
                for (let i = 1; i < length; i++) {
                    const node = nodes[i]
                    node.x = x
                    node.y = y
                }
            }
        },

        update() {
            let prev = nodes[0]
            let thickRadius = radius * monsterSettings.thickness
            const step = thickRadius / length
            for (let i = 1, j = 0; i < length; i++, j++) {
                const node = nodes[i]
                node.x += node.vx
                node.y += node.vy
                const dx = prev.x - node.x
                const dy = prev.y - node.y
                const da = Math.atan2(dy, dx)
                const px = node.x + Math.cos(da) * spacing * monsterSettings.length
                const py = node.y + Math.sin(da) * spacing * monsterSettings.length
                node.x = prev.x - (px - node.x)
                node.y = prev.y - (py - node.y)
                node.vx = node.x - node.ox
                node.vy = node.y - node.oy
                node.vx *= friction * (1 - settings.drawer.friction.value)
                node.vy *= friction * (1 - settings.drawer.friction.value)
                node.vx += settings.drawer.wind.value
                node.vy += settings.drawer.gravity.value
                node.ox = node.x
                node.oy = node.y
                const sin = Math.sin(da + HALF_PI)
                const cos = Math.cos(da + HALF_PI)
                outer[j] = {
                    x: prev.x + cos * thickRadius,
                    y: prev.y + sin * thickRadius
                }
                inner[j] = {
                    x: prev.x - cos * thickRadius,
                    y: prev.y - sin * thickRadius
                }
                theta[j] = da
                thickRadius -= step
                prev = node
            }
        },

        draw(ctx) {
            const start = outer[0]
            const end = inner[0]
            ctx.beginPath()
            ctx.moveTo(start.x, start.y)
            curveThroughPoints(outer, ctx)
            curveThroughPoints(inner.reverse(), ctx)
            ctx.lineTo(end.x, end.y)
            ctx.closePath()
            const c = hexToHsv(monsterSettings.color)
            const h = Math.min(c.h * shade, 360)
            const s2 = Math.min(c.s * shade, 100)
            let v = clamp(c.v * shade, 10, 100 - 10)
            ctx.fillStyle = hsvToHex({ h, s: s2, v })
            ctx.fill()
            if (monsterSettings.thickness > 2) {
                v += isDark(settings) ? -10 : 10
                ctx.strokeStyle = hsvToHex({ h, s: s2, v })
                ctx.lineWidth = 1
                ctx.stroke()
            }
        },
    }
}
interface Node {
    x: number
    y: number
    ox: number
    oy: number
    vx: number
    vy: number
}
function makeNode(x = 0.0, y = 0.0): Node {
    return { x, y, ox: x, oy: y, vx: 0.0, vy: 0.0 }
}

function curveThroughPoints(points: Point[], ctx: CanvasRenderingContext2D) {
    const n = points.length - 2
    let i: number, a: Point, b: Point
    for (i = 1; i < n; i++) {
        a = points[i]
        b = points[i + 1]
        const x = (a.x + b.x) * 0.5
        const y = (a.y + b.y) * 0.5
        ctx.quadraticCurveTo(a.x, a.y, x, y)
    }
    a = points[i]
    b = points[i + 1]
    ctx.quadraticCurveTo(a.x, a.y, b.x, b.y)
}

function calcOverlap(center: Point, radius: number, point: Point): Point {
    const dx = point.x - center.x
    const dy = point.y - center.y
    const dist = Math.sqrt(dx ** 2 + dy ** 2)
    if (dist > radius) { return null }
    const c = radius / dist
    return { x: dx * c, y: dy * c }
    // const angleDeg = Math.atan2(point.y - center.y, point.x - center.x) * 180 / Math.PI;

}
