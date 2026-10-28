import React from 'react'
import { Settings, Touch, Touches } from '../context'
import { useScene } from '../hooks'
import { bindTouch, SceneApi } from '../textureUtils'

type FlatWaveTouch = Touch & { metadata?: { color: number, radius: number } }

export default function FlatWaves(): JSX.Element {
    const [onRef] = useScene(createScene)

    return <canvas ref={onRef} style={{ width: '100%' }} />
}

function createScene(canvas: HTMLCanvasElement, screenInfo): SceneApi {
    const { width: WIDTH, height: HEIGHT } = screenInfo
    const USER_COLOR = 'rgb(255, 244, 145)'
    const OTHER_USER_COLOR = '#9EE7FF'
    const USER_TOUCH_DIAMETER = 20
    const MAX_WAVE_RADIUS = 1000
    let growRate = 5 //
    const NEW_WAVE_MIN_RADIUS = 1

    const WAVE_RADIUS_VARIATION = 30
    let myColors = [
        'rgb(255, 205, 112)',
        'rgb(245, 66, 75)',
        'rgb(255, 158, 158)',
        'rgb(173, 252, 255)',
        'rgb(235, 173, 255)',
        'rgb(125, 245, 159)',
        'rgb(222, 244, 145)',
        'rgb(158, 170, 186)',
        'rgb(158, 231, 255)',
    ]

    let otherTouches: Touches = [{ x: -1, y: -1, type: 'up' }]
    let lastTouches: Touches = [{ x: -1, y: -1, type: 'up' }]
    let isTouching = false

    canvas.width = WIDTH
    canvas.height = HEIGHT

    const ctx = canvas.getContext('2d')

    const waves = []

    function removeOldWaves() {
        while (waves.length > 1 && waves[1].radius > MAX_WAVE_RADIUS) {
            waves.shift()
        }
    }

    let lastEnvColorIndex = 0
    function addWave(coords) {
        const colorIndex = lastEnvColorIndex++
        const color = myColors[colorIndex % myColors.length]
        const radius = Math.floor(WAVE_RADIUS_VARIATION * Math.random()) + NEW_WAVE_MIN_RADIUS
        const x = coords.x
        const y = coords.y
        waves.push({ color, radius, x, y })
        removeOldWaves()

        // send ready-to-draw waves to the other device
        touchCallback([{ x, y, metadata: { color, radius } }])
    }

    function renderWaveFrame(elapsed: number) {
        fresh()
        waves
            .forEach(wave => {
                wave.radius = wave.radius + growRate * elapsed / 45
                ctx.beginPath()
                if (wave.radius < 0) return
                ctx.arc(wave.x, wave.y, wave.radius, 0, Math.PI * 2)
                ctx.fillStyle = wave.color
                ctx.fill()
            })
    }

    function drawUserTouchPoint(coords, color) {
        if (coords.x < 0) return

        ctx.beginPath()
        ctx.arc(coords.x, coords.y, USER_TOUCH_DIAMETER, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
    }

    let addNewWavesInterval
    let lastSentTouches = lastTouches
    let stopped = false
    let lastFrameTime = new Date().getTime()
    let touchCallback = (_) => _
    function render(time) {
        if (stopped) return
        // draw touch points every 1/30th of a second
        if (lastSentTouches !== lastTouches) {
            lastSentTouches = lastTouches
            touchCallback(lastTouches)
        }
        const elapsed = time - lastFrameTime
        lastFrameTime = time
        renderWaveFrame(elapsed)
        if (isTouching) lastTouches.forEach(t => drawUserTouchPoint(t, USER_COLOR))
        otherTouches.filter(touch => touch.type !== 'up').forEach(t => drawUserTouchPoint(t, OTHER_USER_COLOR))
        // make a wave every third of a second
        window.requestAnimationFrame(render)
    }
    function startNewWaves() {
        addNewWavesInterval = setInterval(() => {
            if (isTouching) {
                lastTouches.forEach(t => addWave(t))
            }
        }, 1000 / 3)
    }


    function fresh() {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = myColors[0]
        ctx.fillRect(0, 0, canvas.width, canvas.height)
    }


    bindTouch({
        el: canvas,
        touchCallback: touches => {
            isTouching = true
            touches.forEach(touch => addWave(touch))
            lastTouches = touches
        },
        dragCallback: touches => {
            lastTouches = touches
        },
        touchEndCallback: touches => {
            isTouching = false
            lastTouches = touches
        },
    })

    fresh()
    window.requestAnimationFrame(render)
    startNewWaves()


    function setOtherTouches(ots: FlatWaveTouch[]) {
        //if (ots[0].x > 0 && ots[0].type === 'down') ots.forEach(t => addWave(t, true))

        otherTouches.filter(touch => 'metadata' in touch).forEach((t: FlatWaveTouch) => {
            // manually add waves when they come in from network
            waves.push({ color: t.metadata.color, radius: t.metadata.radius, x: t.x, y: t.y })
            removeOldWaves()
        })
        otherTouches = ots
    }
    function stopTime() {
        stopped = true
        clearInterval(addNewWavesInterval)
    }

    function onTouches(callback) {
        touchCallback = callback
    }

    function setSettings(settings: Settings) {
        if (settings.drawer.speed != null) {
            growRate = settings.drawer.speed.value as number
        } if (settings.drawer.colors != null) {
            myColors = settings.drawer.colors.value as string[]
        }
    }

    return { setOtherTouches, onTouches, stopTime, setSettings }
}
