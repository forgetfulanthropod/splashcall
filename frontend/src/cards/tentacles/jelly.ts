// TODO?: Switch repel physics to polygon-clipping-based algorithm?
import { drawArrow } from "../canvasUtils"

export type VecLike = [number, number]
export type Vec = [number, number]

export const Vec = {

    addv(v1: Vec, v2: Vec): Vec {
        return [
            v1[0] + v2[0],
            v1[1] + v2[1]]

    },
    addn(v1: Vec, n: number): Vec {
        return [
            v1[0] + n,
            v1[1] + n]

    },

    sub(v1: Vec, v2: Vec): Vec {
        return [
            v1[0] - v2[0],
            v1[1] - v2[1]]

    },

    mulv(v1: Vec, v2: Vec): Vec {
        return [
            v1[0] * v2[0],
            v1[1] * v2[1]]

    },
    muln(v1: Vec, n: number): Vec {
        return [
            v1[0] * n,
            v1[1] * n]

    },

    dot(v1: Vec, v2: Vec): number {
        return v1[0] * v2[0] + v1[1] * v2[1]
    },

    neg(v: Vec): Vec {
        return [-v[0], -v[1]]
    },

    angleVec(v1: Vec, v2: Vec): Vec {
        return Vec.normalize(Vec.sub(v2, v1))
    },

    fromAngle(radians: number): Vec {
        return [Math.cos(radians), Math.sin(radians)]
    },

    fromAngleDeg(degrees: number): Vec {
        degrees = mod(degrees, 360)
        const rad = degrees * Math.PI / 180
        return [Math.cos(rad), Math.sin(rad)]
    },

    mid(v1: Vec, v2: Vec): Vec {
        return [(v1[0] + v2[0]) / 2, (v1[1] + v2[1]) / 2]
    },

    magnitude(v: Vec): number {
        return Math.sqrt(v[0] * v[0] + v[1] * v[1])
    },

    normalize(v: Vec): Vec {
        const mag = Vec.magnitude(v)
        return [v[0] / mag, v[1] / mag]
    },

    distance(v1: Vec, v2: Vec): number {
        return Vec.magnitude(Vec.sub(v1, v2))
    }

}

class Point {
    vel: Vec
    force: Vec
    angle: number
    torque: number
    initialSpacing: number
    constructor(public pos: Vec, public spacing: number, public rotVel: number) {
        this.vel = [0, 0]
        this.force = [0, 0]
        this.initialSpacing = spacing

        this.angle = 0
        this.torque = 0
    }

    update(settings: Settings) {
        this.vel = Vec.muln(this.vel, 1 - settings.friction)
        this.vel = Vec.addv(this.vel, Vec.muln(this.force, settings.speed))

        this.force = [0, settings.gravity / settings.iterations]

        this.pos = Vec.addv(this.pos, Vec.muln(this.vel, settings.speed))

        const qPI = Math.PI / 4
        this.rotVel += this.torque / ((this.spacing / 2) ** 2 / 2)
        this.rotVel = clamp(this.rotVel * settings.speed, -qPI, qPI)

        this.angle += this.rotVel
        this.torque = 0

    }


    addForce(F: Vec) {
        this.force = Vec.addv(this.force, F)
    }

    addTorque(F: Vec, R: Vec) {
        const arm = Vec.sub(R, this.pos)
        const torque = F[1] * arm[0] - F[0] * arm[1]
        this.torque += torque
    }

    moveTowards(target: VecLike, speed: number) {
        // const strength = 0.1
        const clip = (x, l) => Math.abs(x) < l ? 0 : x
        const idealSpeed: Vec = [
            clip(target[0] - this.pos[0], 5) * speed,
            clip(target[1] - this.pos[1], 5) * speed]
        this.addForce(Vec.sub(idealSpeed, this.vel))
        // this.vel[0] += Math.sqrt(target[0] - this.pos[0]) * strength * speed
        // this.vel[1] = Math.sqrt(target[1] - this.pos[1]) * strength * speed
        this.vel = Vec.muln(this.vel, 0.99)
    }

    static toWorld(point: Point, v: Vec): Vec {
        const s = Math.sin(point.angle)
        const c = Math.cos(point.angle)
        // if (Math.random() < 0.001) {
        //     console.log(s, c)
        //     debugger
        // }
        return [
            -v[1] * s + v[0] * c,
            v[1] * c + v[0] * s]

    }

    static velAt(point: Point, R: Vec) {
        let dr = Vec.sub(R, point.pos)
        const vdr = point.rotVel * dr.length

        dr = Vec.normalize(dr)

        return Vec.addv(
            point.vel,
            [vdr * -dr[1], vdr * dr[0]])
    }

}


interface BorderPoint extends Point {
    parentCenter: Point
    initialDistance: number
}


export class Circle {
    points: Point[]
    borderPoints: BorderPoint[]
    color: string
    constraints: SpringConstraint[]
    centerPoint: Point
    numRings: number
    radius: number

    constructor(args: { numRings?: number, pointsPerRing?: number, spacing?: number, color?: string, center: [number, number] }) {
        const { spacing = 14, pointsPerRing = 20 } = args
        this.numRings = args.numRings ?? 5
        this.color = args.color ?? "#888"
        this.radius = this.numRings * spacing

        const centerX = args.center[0]
        const centerY = args.center[1]
        this.centerPoint = new Point([centerX, centerY], spacing, 0)

        const rings = Array(this.numRings).fill(0).map((_, i) => {
            const innerRadius = spacing * (i + 1)
            const numPoints = pointsPerRing
            const result = Array(numPoints).fill(0).map((_, j) => {
                const rad = Math.PI * 2 * j / numPoints
                const x = centerX + innerRadius * Math.cos(rad)
                const y = centerY + innerRadius * Math.sin(rad)
                return new Point([x, y], spacing, 0)
            })
            return result
        })

        this.constraints = []
        rings.forEach((ring, i) =>
            ring.forEach((point, j) => {
                {
                    const lastPoint = ring[j === 0 ? ring.length - 1 : j - 1]
                    const vec = Vec.muln(Vec.sub(point.pos, lastPoint.pos), 1 / 2)
                    this.constraints.push([lastPoint, point, vec, "spring", vec.length])
                }

                const prevRingPoint = i === 0 ? this.centerPoint : rings[i - 1][j]
                const vec = Vec.muln(Vec.sub(point.pos, prevRingPoint.pos), 1 / 2)
                this.constraints.push([prevRingPoint, point, vec, "spring", vec.length])
            }))

        const lastRing = rings[rings.length - 1] as BorderPoint[]
        lastRing.forEach(point => {
            point.parentCenter = this.centerPoint
            point.initialDistance = Vec.distance(point.pos, (this.centerPoint.pos))
        })

        this.borderPoints = lastRing
        this.points = [this.centerPoint, ...rings.flat()]
    }

    moveTowards(target: VecLike, speed: number): void {
        // this.centerPoint.moveTowards(target, speed)
        for (const p of this.points) {
            p.moveTowards(Vec.addv(target, Vec.sub(p.pos, this.centerPoint.pos)), speed)
        }
    }

    addForce(force: Vec): void {
        for (const p of this.points) {
            p.addForce(force)
        }
    }


    draw(ctx: CanvasRenderingContext2D): void {
        const points = this.borderPoints.map(p => p.pos)

        ctx.lineWidth = 2
        // debugger
        ctx.fillStyle = this.color
        ctx.strokeStyle = this.color
        // ctx.globalAlpha = 0.5
        // ctx.fillStyle = `hsla(${this.hue}, 90%, 80%, 0.8)`
        // ctx.strokeStyle = `hsla(${this.hue}, 90%, 70%, 0.8)`

        const n = points.length
        ctx.moveTo(points[0][0], points[0][1])
        ctx.beginPath()

        const tension = 1
        // stackoverflow.com/a/49371349
        for (let i = 0; i < points.length; i++) {
            const p0 = points[mod(i - 1, n)]
            const p1 = points[mod(i, n)]
            const p2 = points[mod(i + 1, n)]
            const p3 = points[mod(i + 2, n)]

            const cp1x = p1[0] + (p2[0] - p0[0]) / 6 * tension
            const cp1y = p1[1] + (p2[1] - p0[1]) / 6 * tension

            const cp2x = p2[0] - (p3[0] - p1[0]) / 6 * tension
            const cp2y = p2[1] - (p3[1] - p1[1]) / 6 * tension

            ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2[0], p2[1])
        }



        // const endMid = Vec.mid(points[0], points[n - 1])
        // ctx.moveTo(endMid[0], endMid[1])
        // for (let i = 0; i < n; i++) {
        //   const mid = Vec.mid(points[i % n], points[(i + 1) % n])
        //   // const cp_x1 = (x_mid + points[i][0]) / 2
        //   // const cp_x2 = (x_mid + points[i + 1][0]) / 2
        //   ctx.quadraticCurveTo(points[i % n][0], points[i % n][1], mid[0], mid[1])
        //   // ctx.quadraticCurveTo(cp_x2, points[i + 1][1], points[i + 1][0], points[i + 1][1])
        // }
        // // ctx.quadraticCurveTo(points[n - 1][0], points[n - 1][1], points[0][0], points[0][1])




        ctx.closePath()
        ctx.stroke()
        ctx.fill()
        // ctx.globalAlpha = 1.0
    }
}


type Rectangle = Circle // TODO
// class Rectangle {
//   points: Point[]
//   borderPoints: BorderPoint[]
//   // widthpx: number
//   centerPoint: Point

//   constructor(public width: number, public height: number, public spacing: number, public hue: number, xi?: number, yi?: number) {

//     if (canvas == null) { throw Error("canvas is null") }

//     // this.widthpx = width * spacing
//     const xOff = xi ?? random(0, WIDTH - width * spacing)
//     const yOff = yi ?? random(0, HEIGHT - height * spacing)

//     this.points = Array(width * height).fill(0).map((_, i: number) => {
//       const x = i % width
//       const y = ~~(i / width)

//       return new Point(
//         (
//           xOff + x * spacing,
//           yOff + y * spacing),
//         this.spacing,
//         0)
//     })
//     this.centerPoint = this.points[~~(this.points.length / 2)]

//     this.points.forEach((point: Point, i: number) => {
//       const x = i % width
//       const y = ~~(i / width)

//       if (x > 0) {
//         allConstraints.push([
//           this.points[i - 1],
//           point,
//           Vec.mul(Vec.sub(point.pos, this.points[i - 1].pos), 1 / 2),
//           "spring"])

//       }

//       if (y > 0) {
//         allConstraints.push([
//           this.points[i - width],
//           point,
//           Vec.mul(Vec.sub(point.pos, this.points[i - width].pos), 1 / 2),
//           "spring"])

//       }
//     })

//     this.borderPoints = []

//     for (let i = 0; i < width; i++) {
//       const p = this.points[i] as BorderPoint
//       this.borderPoints.push(p)
//     }

//     for (let i = 0; i < height; i++) {
//       const p = this.points[width - 1 + width * i] as BorderPoint
//       this.borderPoints.push(p)
//     }

//     for (let i = width - 1; i > -1; i--) {
//       const p = this.points[(height - 1) * width + i] as BorderPoint
//       this.borderPoints.push(p)
//     }

//     for (let i = height - 1; i > -1; i--) {
//       const p = this.points[width * i] as BorderPoint
//       this.borderPoints.push(p)
//     }

//     for (const p of this.borderPoints) {
//       p.parentCenter = this.centerPoint
//     }
//   }

//   draw(ctx: CanvasRenderingContext2D) {
//     const drawPoints = this.borderPoints.map(p => p.pos)

//     ctx.lineWidth = 2
//     ctx.fillStyle = `hsla(${this.hue}, 90%, 80%, 0.8)`
//     ctx.strokeStyle = `hsla(${this.hue}, 90%, 70%, 0.8)`

//     ctx.beginPath()
//     ctx.moveTo(drawPoints[0][0], drawPoints[0][1])

//     drawPoints.forEach((point: Vec, i: number) => {
//       i && ctx.lineTo(point[0], point[1])
//     })

//     ctx.closePath()



//     ctx.lineTo(drawPoints[0][0], drawPoints[0][1])
//     ctx.stroke()
//     ctx.fill()
//   }
// }


type Constraint = SpringConstraint | RepelConstraint
type SpringConstraint = [Point, Point, Vec, "spring", number]
type RepelConstraint = [BorderPoint, BorderPoint, number, "repel"]


type Shape = Rectangle | Circle

// let lastTime = Date.now()

export class World {
    settings: Settings
    allConstraints: Constraint[]
    allPoints: Point[]
    oldSpeed = defaultSettings.speed
    inSlomo = false
    lastSlomoStart = 0

    constructor(readonly shapes: Shape[]) {
        this.settings = defaultSettings


        this.allConstraints = [
            ...shapes.flatMap(s => s.constraints),
            ...World.generateBorderConstraints(shapes),
        ]
        this.allPoints = shapes.map(({ points }) => points).flat()
    }

    getData(): string {
        return JSON.stringify({
            time: Date.now(),
            numbers: this.allPoints.map(p => [p.pos[0], p.pos[1], p.vel[0], p.vel[1]])
        })
    }
    setData(string: string): void {
        const data = JSON.parse(string) as {
            time: number,
            numbers: [number, number, number, number][]
        }
        // not perfect:
        const elapsed = (Date.now() - data.time) / 60 * this.settings.speed
        this.allPoints.forEach((p, i) => {
            const [x, y, vx, vy] = data.numbers[i];
            [p.pos[0], p.pos[1], p.vel[0], p.vel[1]] = [x + vx * elapsed, y + vy * elapsed, vx, vy]
        })
    }

    private enforceConstraint = (constraint: Constraint) => {
        // NOTE: you can disable springs but keep repelling to make monsters explode
        if (constraint[3] === "spring") {
            // return
            const [a, b, v] = constraint
            // const refA = Vec.addv(Point.toWorld(a, v), a.pos)
            // const refB = Vec.addv(Point.toWorld(b, Vec.muln(v, -1)), b.pos)
            const refA = Vec.addv(v, a.pos)
            const refB = Vec.addv(Vec.muln(v, -1), b.pos)

            const diff = Vec.sub(refB, refA)
            const mid = Vec.addv(refA, Vec.muln(diff, 0.5))


            const mfc = 0.04
            let mf = Vec.muln(diff, mfc)
            const dm = Vec.sub(Point.velAt(b, mid), Point.velAt(a, mid))
            mf = Vec.addv(mf, Vec.muln(dm, mfc))
            a.addForce(mf)
            b.addForce(Vec.muln(mf, -1))

            if (this.settings.enableRotation) {
                // This sometimes makes circles be weird and shake
                // I think the problem is that this algorithm expects points to be in straight lines
                // but with lines going around in a circle, maybe the torques add up or something
                const torque = clamp(b.angle - a.angle, -Math.PI, Math.PI)
                a.torque += torque
                b.torque -= torque

                const tfc = 0.02
                let tf = Vec.muln(diff, tfc)
                tf = Vec.addv(tf, Vec.muln(dm, tfc))

                a.addTorque(tf, mid)
                b.addTorque(Vec.muln(tf, -1), mid)
            }
        }

        else if (constraint[3] === "repel") {
            const [a, b] = constraint
            if (a.pos[0] - b.pos[0] > 200 && a.pos[1] - b.pos[1] > 200) return
            const centerDist = Vec.distance(a.pos, a.parentCenter.pos)
            const dist = Vec.distance(a.pos, b.pos)
            if (dist > centerDist / 4) { return }
            let inwards = Vec.angleVec(a.pos, a.parentCenter.pos)
            const diff = Vec.sub(a.pos, b.pos)
            const distAlongAxis = Vec.dot(inwards, diff)
            if (distAlongAxis < 0) {
                inwards = Vec.muln(inwards, Math.min(a.initialDistance / centerDist, 2) ** 4)
                a.addForce(inwards)
                b.addForce(Vec.neg(inwards))
            }
        }

        else {
            throw Error(`unknown constraint type ${constraint[3]}`)
        }
    }


    update(ctx: CanvasRenderingContext2D): void {
        // if (Date.now() - this.lastTime < 1000 / this.settings.maxFps) {
        //     window.requestAnimationFrame(() => this.update(ctx))
        //     return
        // }
        // this.lastTime = Date.now()
        const width = ctx.canvas.width
        const height = ctx.canvas.height
        if (this.settings.drawShapes) this.shapes.forEach(s => s.draw(ctx))
        if (this.settings.drawConstraints) this.allConstraints.forEach(c => drawConstraint(ctx, c))
        if (this.settings.drawPoints) this.allPoints.forEach(p => drawPoint(ctx, p))


        if (this.settings.slomoCollisions) {
            const minSpeed = 3
            const n = this.shapes.length
            let maxNearSpeed = 0
            let someisOverlapping = false
            for (let i = 0; i < n; i++) {
                const si = this.shapes[i]
                const cpi = si.centerPoint
                for (let j = i + 1; j < n; j++) {
                    const sj = this.shapes[j]
                    const cpj = sj.centerPoint
                    const curDist = Vec.distance(cpi.pos, cpj.pos)
                    const nextDist = Vec.distance(Vec.addv(cpi.pos, cpi.vel), Vec.addv(cpj.pos, cpj.vel))
                    const isNear = curDist < (si.radius + sj.radius) * 2
                    someisOverlapping = someisOverlapping || curDist < (si.radius + sj.radius)
                    if (isNear && curDist - nextDist > 0) {
                        maxNearSpeed = Math.max(maxNearSpeed, curDist - nextDist)
                    }
                }
            }
            if (maxNearSpeed > minSpeed && !this.inSlomo && Date.now() - this.lastSlomoStart > 1500) {
                this.lastSlomoStart = Date.now()
                this.oldSpeed = this.settings.speed
                this.settings.speed /= Math.max(2, maxNearSpeed)
                this.inSlomo = true
            }
            if ((maxNearSpeed < minSpeed && !someisOverlapping && this.inSlomo && Date.now() - this.lastSlomoStart > 1000) ||
                Date.now() - this.lastSlomoStart > 2500) {
                this.settings.speed = this.oldSpeed
                this.inSlomo = false
            }
        }


        let i = this.settings.iterations
        while (i--) {
            this.allConstraints.forEach(this.enforceConstraint)

            if (this.settings.border === "stop") {
                this.allPoints.forEach(point => {
                    const damping = 0.6
                    const spacing = 0
                    if (point.pos[0] < spacing) {
                        point.force = Vec.addv(point.force, [(spacing - point.pos[0]) * 1, 0])
                        point.vel[0] *= damping
                    } else if (point.pos[0] > width - spacing) {
                        point.force = Vec.addv(point.force, [(point.pos[0] - width + spacing) * -1, 0])
                        point.vel[0] *= damping
                    }
                    if (point.pos[1] < spacing) {
                        point.force = Vec.addv(point.force, [0, (spacing - point.pos[1]) * 1])
                        point.vel[1] *= damping
                    } else if (point.pos[1] > height - spacing) {
                        point.force = Vec.addv(point.force, [0, (point.pos[1] - height + spacing) * -1])
                        point.vel[1] *= damping
                    }
                    point.update(this.settings)
                })
            } else { // "pull"
                for (const shape of this.shapes) {
                    const c = shape.centerPoint.pos
                    const space = this.settings.pullSpacing
                    const size = 0.001
                    if (c[0] < space) {
                        shape.addForce([size, 0])
                    } if (c[0] > width - space) {
                        shape.addForce([-size, 0])
                    } if (c[1] < space) {
                        shape.addForce([0, size])
                    } if (c[1] > height) {
                        shape.addForce([0, -size])
                    }
                }
                this.allPoints.forEach(point => point.update(this.settings))
            }
        }

    }


    static generateBorderConstraints(shapes: Shape[]): Constraint[] {
        return crossDistinct(shapes, shapes).flatMap(([s1, s2]) =>
            cross(s1.borderPoints, s2.borderPoints).map(([p1, p2]): Constraint =>
                [p1, p2, 0, "repel"]))
    }
}


function drawConstraint(ctx: CanvasRenderingContext2D, constraint: Constraint) {
    if (ctx == null) { return }
    let badness = 0
    const [a, b] = constraint
    const distance = Vec.distance(a.pos, b.pos)
    if (constraint[3] === "spring") {
        const [a, b, v] = constraint
        const ratio = distance / (constraint[2].length * 2)
        badness = clamp(Math.abs(ratio - 1), 0, 1)
        const to = Vec.addv(a.pos, Point.toWorld(a, v))
        drawArrow(ctx, { x: a.pos[0], y: a.pos[1] }, { x: to[0], y: to[1] })
        const badnessSensitivity = 3
        const color = `rgb(${badness * badnessSensitivity * 255},0,0)`
        ctx.lineWidth = 1
        ctx.strokeStyle = color
        ctx.beginPath()
        ctx.moveTo(a.pos[0], a.pos[1])
        ctx.lineTo(b.pos[0], b.pos[1])
        ctx.closePath()
        ctx.stroke()
    } else {
        // const [a, _, repelDist] = constraint
        // drawArrow(ctx, a.pos, Vec.add(a.pos, Vec.mul(Point.toWorld(a, a.initialInwards).normalize(), repelDist)))
    }

}


function drawPoint(ctx: CanvasRenderingContext2D, p: Point, color = 'black', radius = 2) {
    if (ctx == null) { throw Error("ctx is null") }
    ctx.lineWidth = 1
    ctx.fillStyle = color
    ctx.strokeStyle = color
    ctx.beginPath()
    ctx.arc(p.pos[0], p.pos[1], radius, 0, Math.PI * 2)
    ctx.closePath()
    ctx.stroke()
    ctx.fill()
    // const angleVec = (Math.cos(p.angle), Math.sin(p.angle))
    // drawArrow(ctx, p.pos, Vec.add(p.pos, Vec.mul(angleVec, 10)), "purple")
}


function clamp(val: number, min: number, max: number) {
    return Math.min(Math.max(val, min), max)
}


function cross<T, S>(A: T[], B: S[]): [T, S][] {
    return A.flatMap(a => B.map((b): [T, S] => [a, b]))
}


function crossDistinct<T>(A: T[], B: T[]): [T, T][] {
    return A.flatMap(a => B.filter(b => b !== a).map((b): [T, T] => [a, b]))
}


function mod(n: number, m: number): number {
    return ((n % m) + m) % m
}


type Settings = typeof defaultSettings
const defaultSettings = {
    drawShapes: true,
    drawConstraints: false,
    drawPoints: false,
    enableRotation: false,
    maxFps: 200,
    friction: 0.001,
    slomoCollisions: false,
    // repelRange: 40,
    spacing: 14,
    iterations: 30,
    gravity: 0,
    speed: 0.25,
    border: "stop", // "pull" as "stop" | "pull",
    pullSpacing: 50,
}
