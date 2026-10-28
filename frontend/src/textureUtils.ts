import { Settings, Touches } from './context'

type Handler<T> = (t: T) => void
type OnHandler<T> = (callback: (t: T) => void) => void

export interface SceneApi {
    stopTime: () => void
    setOtherTouches: Handler<Touches>
    onTouches: OnHandler<Touches>
    setSettings?: Handler<Settings>
    getSettings?: () => Settings
    onSettingsChange?: OnHandler<Settings>
}

interface BindTouchParams {
    el: HTMLCanvasElement
    touchCallback: Handler<Touches>
    dragCallback: Handler<Touches>
    touchEndCallback: Handler<Touches>
    ignoreMouseOut?: boolean
}

export function bindTouch({ el, touchCallback, dragCallback, touchEndCallback, ignoreMouseOut }: BindTouchParams): void {
    let down = false

    if (!ignoreMouseOut) el.onmouseover = e => {
        if (e.buttons?.[0] != null) {
            down = true
            processEvent(e, touchCallback, 'down')
        }
    }

    const handleDown = e => {
        down = true
        processEvent(e, touchCallback, 'down')
    }
    el.ontouchstart = handleDown
    el.onmousedown = handleDown

    const handleUp = e => {
        processEvent(e, touchEndCallback, 'up')
        down = false
    }

    el.ontouchend = el.onmouseup = el.ondragleave = handleUp

    if (!ignoreMouseOut) el.onmouseleave = el.ontouchcancel = handleUp

    const handleMove = e => processEvent(e, dragCallback, 'move')
    el.ontouchmove = handleMove
    el.onmousemove = handleMove


    const sequenceNumbers = {}
    function getAndIncrementSequenceNumberDefault(uid) {
        if (uid in sequenceNumbers) {
            sequenceNumbers[uid] += 1
            return sequenceNumbers[uid]
        }
        sequenceNumbers[uid] = 0
        return 0
    }

    function processEvent(e, callback, type) {
        if (!down) return


        // console.log(e)
        if (e.touches != null) { // PROBLEM: e.touches is null if there is no touch
            const touches = []
            for (const touch of e.touches) {
                const [x, y] = xyFromTouch(touch)
                const uid = touch.identifier.toString()
                const index = getAndIncrementSequenceNumberDefault(uid)
                touches.push({ x, y, uid, index, type })
                if (type == 'up') delete sequenceNumbers[uid]
            }
            // with touch emulation, sometimes ontouchend has empty touches
            if (!touches.length) touches.push({ x: -1, y: -1, type: 'up' })
            callback(touches)
        } else {
            const [x, y] = xyFromTouch(e)
            const uid = '0'
            const index = getAndIncrementSequenceNumberDefault(uid)

            callback([{ x, y, uid, index, type }])
            if (type == 'up') delete sequenceNumbers[uid]
        }

        function xyFromTouch(touch) {
            const rect = el.getBoundingClientRect() // TODO: don't ask for rect on every touch
            return [
                (touch.clientX - rect.left) / (rect.right - rect.left) * el.width,
                (touch.clientY - rect.top) / (rect.bottom - rect.top) * el.height
            ]
        }
    }
}
