//@ts-strict

// Game will eventually need:
// - time synchronization for dot creation
// - point-taker synchronization
// - overall-score sync
// - hitting each other will stun them
// - chomp sound effects


import cloneDeep from 'lodash/cloneDeep'
import merge from 'lodash/merge'
import { ScreenInfo, Touches } from '../../context'
import { bindTouch, SceneApi } from '../../textureUtils'
import { initializeGame } from './game'
import { Circle as JellyCircle, World as JellyWorld } from './jelly'
import { makeMonster, Monster } from './monster'
import { defaultTentacleSettings, TentacleSettings } from './settings'

export interface TentacleScreenInfo extends ScreenInfo {
    isHost: boolean
    hasJellyHead: boolean
    isGame: boolean
    bgColor: string
    pointFor0?: () => void
    pointFor1?: () => void
}

export default function createScene(canvas: HTMLCanvasElement, screenInfo: TentacleScreenInfo): SceneApi {
    const settings: TentacleSettings = cloneDeep(defaultTentacleSettings)
    let stopped = false
    let touches: Touches = []
    let touchCallback: (ts: Touches) => void
    let otherTouches: Touches = []
    // let lastFullSync = Date.now()
    const ctx = canvas.getContext('2d')
    if (ctx == null) { throw Error("null context") }
    const sketch = makeSketch({ si: screenInfo, ctx, settings })
    bindTouch({
        el: canvas,
        touchCallback(ts) { touches = ts; touchCallback(ts) },
        dragCallback(ts) { touches = ts; touchCallback(ts) },
        touchEndCallback(ts) { touches = []; touchCallback(ts) },
    })


    function loop() {
        if (stopped) return
        const t = touches?.[0]
        const ot = otherTouches?.[0]
        sketch.draw()
        sketch.update(Date.now(), screenInfo.isHost ? [t, ot] : [ot, t])
        requestAnimationFrame(loop)

        // if (settings.drawer.isGame.value && Date.now() - lastFullSync > 1000) {
        //     lastFullSync = Date.now()
        //     fullSync()
        // }
    }
    requestAnimationFrame(loop)


    // function fullSync() {
    //     if (screenInfo.isHost && sketch.world != null) {
    //         toast("sending")
    //         emitBigDataEvent("Tentacles-sync", sketch.world.getData())
    //     }
    // }
    // if (!screenInfo.isHost) {
    //     onDataEvent("Tentacles-sync", (data: string) => {
    //         toast("received")
    //         sketch.world.setData(data)
    //     })
    // }
    return {
        stopTime() {
            stopped = true
        },
        setOtherTouches(ts) {
            if (ts?.length === 0 || ts[0].x === -1 || ts[0].type === "up") {
                otherTouches = []
            } else {
                otherTouches = [ts[0]]
            }
        },
        onTouches(cb) {
            touchCallback = cb
        },
        setSettings(newSettings: TentacleSettings) {
            merge(settings, newSettings)
            if (settings.drawer.isGame.value) {
                settings.drawer.hasAutoMode.value = false
            }
            const dr = newSettings.drawer
            settings.other.m0.color = dr.colors.value[0]
            settings.other.m1.color = dr.colors.value[1]
            settings.other.m0.tentacles = dr.tentacleCount.value
            settings.other.m1.tentacles = dr.tentacleCount.value
            if (screenInfo.hasJellyHead) {
                sketch.world.settings.speed = dr.speed.value
                sketch.world.settings.slomoCollisions = dr.hasSlomoCollisions.value
                sketch.world.settings.friction = dr.friction.value / 100
                sketch.world.shapes[0].color = dr.colors.value[0]
                sketch.world.shapes[1].color = dr.colors.value[1]
            }
        },
    } as SceneApi

}



export type Point = { x: number, y: number }

interface Sketch {
    update(millis: number, touchPoints: [Point?, Point?]): void
    draw(): void
    world?: JellyWorld
}
function makeSketch(args: { si: TentacleScreenInfo, ctx: CanvasRenderingContext2D, settings: TentacleSettings }): Sketch {
    const { ctx, settings, si } = args
    // const retina = 'auto'
    // const container = document.getElementById('container')
    if (ctx == null) {
        throw Error('makeSketch in tentacles got a null context')
    }
    const { width, height } = ctx.canvas

    let world: JellyWorld = null
    const sot = settings.other
    const sdr = settings.drawer
    let m0: Monster = null
    let m1: Monster = null
    if (si.hasJellyHead) {
        const numRings = 5
        const spacing = (sot.m0.headRadius + sot.m0.thickness) / numRings
        const circle0 = new JellyCircle({ center: [width / 4, height / 4], color: sdr.colors.value[0], spacing, numRings })
        const circle1 = new JellyCircle({ center: [width * 3 / 4, height * 3 / 4], color: sdr.colors.value[1], spacing, numRings })
        world = new JellyWorld([
            circle0,
            circle1,
        ])
        m0 = makeMonster({ jellyCircle: circle0, ctx, settings, monsterSettings: sot.m0 })
        m1 = makeMonster({ jellyCircle: circle1, ctx, settings, monsterSettings: sot.m1 })
    } else {
        const center0 = { x: width / 4, y: height / 4 }
        const center1 = { x: width * 3 / 4, y: height * 3 / 4 }
        m0 = makeMonster({ center: center0, otherCenter: center1, ctx, settings, monsterSettings: sot.m0 })
        m1 = makeMonster({ center: center1, otherCenter: center0, ctx, settings, monsterSettings: sot.m1 })
    }

    // hasScored0, hasScored1, lastRequestSent
    const { drawGameDot, updateGameState } = si.isGame ?
        initializeGame(si, width, height) :
        { drawGameDot() { }, updateGameState() { } }
    return {
        world,
        draw() {
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
            const drawMonsters = () => {
                m0.drawStart()
                m1.drawStart()
                for (let i = 0; i < sdr.tentacleCount.value; i++) {
                    m0.drawTentacle()
                    m1.drawTentacle()
                }
            }
            drawMonsters()
            if (settings.drawer.hasLotusEffect.value) {
                drawMonsters() // double drawing produces effect
            }
            m0.drawFinish()
            m1.drawFinish()

            if (si.hasJellyHead) {
                world.update(ctx)
            }

            if (si.isGame) {
                drawGameDot(ctx)
            }
            // draw everything again without clearing the canvas to get lotus flower effect
        },
        update(millis, [touch, otherTouch]) {
            if (si.isGame) {
                updateGameState(si, m0, m1)
            }
            m0.update(millis * sdr.speed.value, touch)
            m1.update(millis * sdr.speed.value, otherTouch)
            if (si.isGame) {
                //pass
            }
        },
    }
}
