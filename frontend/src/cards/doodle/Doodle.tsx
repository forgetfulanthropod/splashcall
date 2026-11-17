'use strict'
/* eslint-disable */
//import * as THREE from "three"
import { useLocalStorageState, useSize } from "ahooks"
import React, { useEffect, useRef, useState } from "react"
import styled from 'styled-components'
import ColorPicker from "../../drawer/ColorPicker"
import { useAppContext, Touch } from "../../context"
import { clearDataEvent, emitDataEvent, onDataEvent } from "../../connection/dataConn"
import { useScene } from "../../hooks"
import { bindTouch, SceneApi } from "../../textureUtils"
import ToolPicker from "./ToolPicker"
import UndoSvg from 'assets/icons/undo.svg'
import RedoSvg from 'assets/icons/redo.svg'
import { BUCKET_TOLERANCE, floodFill } from './floodFill'

interface DoodleTouch extends Touch { metadata?: { tool: { name, color?, size?} } }
interface HistoryState { canUndo: boolean, canRedo: boolean }
interface DoodleApi extends SceneApi {
    setTool: (color) => void
    setCanvas: (d: string) => void
    getCanvas: () => string
    undo: () => boolean
    redo: () => boolean
    historyState: () => HistoryState
    onHistoryChange: (cb: (state: HistoryState) => void) => void
}

const CANVAS_WIDTH = 1200
const HISTORY_LIMIT = 20

const ButtonContainer = styled.div`
    position: absolute;
    bottom: 80px;
    right: 14px;
    border: none;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
`

const HistoryRow = styled.div`
    display: flex;
    gap: 6px;
    margin-bottom: 3px;
`

const RoundButton = styled.button`
    border: 1px solid lightgray;
    box-shadow: none;
    border-radius: 100%;
    width: 50px;
    height: 50px;
    padding: 0;
    background: #f4f4f4;
    &::focus-visible {
        outline: none;
    }
    & > img {
        width: 32px;
        height: 32px;
    }
    &:disabled > img {
        opacity: 0.35;
    }
`

const backgroundColor = "#f4f4f4"

const tools = [
    { name: 'brush', size: 5 },
    { name: 'eraser', size: 5 },
    { name: 'bucket' },
]


export default function Doodle(): JSX.Element {
    const [onRef, scene] = useScene(createScene)

    const { callerType, isCallConnected } = useAppContext()

    const [rememberedColors] = useLocalStorageState('rememberedColors', ['#ffcd70'])
    const [color, setColor] = useState(rememberedColors[0])
    const [tool, setTool] = useState(tools[0])
    const [history, setHistory] = useState<HistoryState>({ canUndo: false, canRedo: false })

    useEffect(() => {
        if (scene == null) return

        const toolColor = tool.name == 'eraser' ? backgroundColor : color

        scene.setTool({ ...tool, ...{ color: toolColor } })
    }, [tool, color, scene])

    useEffect(() => {
        if (scene == null || callerType == null) return


        onDataEvent('Doodle-requestSync', () => {
            if (callerType !== 'host') return
            emitDataEvent('Doodle-sync', scene.getCanvas())
        })
        onDataEvent('Doodle-sync', (d: string) => {
            scene.setCanvas(d)
        })
        return () => {
            clearDataEvent('Doodle-requestSync')
            clearDataEvent('Doodle-sync')
        }
    }, [scene, callerType])

    useEffect(() => {
        if (scene == null || callerType !== 'guest' || !isCallConnected) return

        emitDataEvent('Doodle-requestSync', null)
    }, [scene, callerType, isCallConnected])

    useEffect(() => {
        if (scene == null) return
        const syncHistory = () => setHistory(scene.historyState())
        scene.onHistoryChange(syncHistory)
        syncHistory()
        return () => scene.onHistoryChange(() => { })
    }, [scene])

    function setToolId(id) {
        setTool(tools.find(t => t.name == id))
    }

    function setToolSize(size) {
        const updated = { ...tool, ...{ size } }
        setTool(updated)
        tools[tools.findIndex(t => updated.name === t.name)] = updated
    }

    function publishCanvas() {
        if (!isCallConnected || scene == null) return
        emitDataEvent('Doodle-sync', scene.getCanvas())
    }

    function handleUndo() {
        if (scene == null || !scene.undo()) return
        publishCanvas()
    }

    function handleRedo() {
        if (scene == null || !scene.redo()) return
        publishCanvas()
    }

    const rootRef = useRef(null)
    const size = useSize(rootRef)
    const canvasToDisplayPixelRatio = size.width / CANVAS_WIDTH

    return <div style={{ width: "100%", borderRadius: '12px' }} ref={rootRef}>
        <canvas ref={onRef} style={{ width: "100%" }} />
        <ButtonContainer>
            <HistoryRow>
                <RoundButton type="button" aria-label="Undo" title="Undo" disabled={!history.canUndo} onClick={handleUndo}>
                    <img src={UndoSvg} alt="" />
                </RoundButton>
                <RoundButton type="button" aria-label="Redo" title="Redo" disabled={!history.canRedo} onClick={handleRedo}>
                    <img src={RedoSvg} alt="" />
                </RoundButton>
            </HistoryRow>
            <ToolPicker {...{ canvasToDisplayPixelRatio, tool, setToolSize, setToolId, color, direction: 'left' }} />
            <ColorPicker {...{ color, setColor, direction: 'left up' }} />
        </ButtonContainer>
    </div>
}

function createScene(canvas: HTMLCanvasElement, { width: WIDTH, height: HEIGHT }): DoodleApi {

    canvas.width = CANVAS_WIDTH
    canvas.height = CANVAS_WIDTH * HEIGHT / WIDTH

    let myTool = { name: 'brush', size: 5, color: '#ffcd70' }
    let otherTool: { name, size?, color?} = { name: 'brush', size: 5, color: '#ffcd70' }

    const ctx = canvas.getContext('2d')

    ctx.fillStyle = backgroundColor
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    const drawCircle = function (x, y, r, color) {
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.fillStyle = color
        ctx.arc(x, y, r, 0, 2 * Math.PI, false)
        ctx.fill()
    }

    const drawLine = function (x1, y1, x2, y2, r, color) {
        ctx.strokeStyle = color
        ctx.lineCap = "round"
        ctx.lineWidth = 2 * r
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
    }

    const undoStack: ImageData[] = []
    const redoStack: ImageData[] = []
    let pendingSnapshot: ImageData = null
    let strokeChanged = false
    let openStrokes = 0
    let historyListener: (state: HistoryState) => void = () => { }

    const historyState = function (): HistoryState {
        return { canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 }
    }

    const notifyHistory = function () {
        historyListener(historyState())
    }

    const takeSnapshot = function () {
        return ctx.getImageData(0, 0, canvas.width, canvas.height)
    }

    const pushUndo = function (snapshot: ImageData) {
        undoStack.push(snapshot)
        if (undoStack.length > HISTORY_LIMIT) undoStack.shift()
        redoStack.length = 0
        notifyHistory()
    }

    const fillColor = function (x, y, color) {
        const rgb = hexToRgb(color)
        if (rgb == null) return false
        const px = pixelCoord(x, canvas.width)
        const py = pixelCoord(y, canvas.height)
        if (px < 0 || py < 0) return false

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const changed = floodFill(
            imageData.data,
            canvas.width,
            canvas.height,
            px,
            py,
            [rgb[0], rgb[1], rgb[2]],
            BUCKET_TOLERANCE,
        )
        if (changed) ctx.putImageData(imageData, 0, 0)
        return changed
    }


    const eventToXY = function (e) {
        const rect = canvas.getBoundingClientRect()
        const offsetLeft = rect.left
        const offsetTop = rect.top

        return [e.clientX - offsetLeft, e.clientY - offsetTop]
    }


    let touchStates = {}
    const downHandler = function (touch, tool) {
        const isStroke = tool.name == 'brush' || tool.name == 'eraser'
        touchStates[touch.uid] = { lastX: touch.x, lastY: touch.y, lastIndex: 0, isStroke }
        if (isStroke) {
            if (openStrokes === 0) {
                pendingSnapshot = takeSnapshot()
                strokeChanged = false
            }
            openStrokes += 1
            // A brush tap leaves a dot. The eraser stays put until the pointer moves,
            // matching the previous stroke behavior.
            if (tool.name == 'brush') {
                drawCircle(touch.x, touch.y, tool.size, tool.color)
                strokeChanged = true
            }
        }
        else if (tool.name == 'bucket') {
            // A fill during someone else's stroke belongs to that open gesture.
            if (openStrokes === 0) {
                const before = takeSnapshot()
                if (fillColor(touch.x, touch.y, tool.color)) pushUndo(before)
            } else if (fillColor(touch.x, touch.y, tool.color)) {
                strokeChanged = true
            }
        }
    }

    const moveHandler = function (touch, tool) {
        if (tool.name == 'bucket') return

        if (!(touch.uid in touchStates)) {
            console.error("Uh oh: Touch had move before down??", touch, touchStates)
            return
        }
        const touchState = touchStates[touch.uid]
        if (touchState.lastIndex == touch.index - 1) {
            drawLine(touch.x, touch.y, touchState.lastX, touchState.lastY, tool.size, tool.color)
            strokeChanged = true
        } else {
            console.info("Uh oh! Lost a touch between index", touchState.lastIndex, touch.index)
        }
        touchState.lastX = touch.x
        touchState.lastY = touch.y
        touchState.lastIndex = touch.index
    }

    const upHandler = function (touch, tool) {
        if (!(touch.uid in touchStates)) {
            // Below could be a problem for clicks but probably not for touches.
            // (uid gets set to undefined on touch up in textureUtils.ts)
            // console.log("touch.uid", touch.uid)
            // console.error("Uh oh: Touch had up before down??")
            // touchState slowly fills with junk but that should be fine.
            return
        }
        const wasStroke = touchStates[touch.uid].isStroke
        delete touchStates[touch.uid]
        if (!wasStroke) return
        openStrokes = Math.max(0, openStrokes - 1)
        if (openStrokes === 0 && pendingSnapshot != null) {
            const snapshot = pendingSnapshot
            pendingSnapshot = null
            if (strokeChanged) pushUndo(snapshot)
        }
    }

    bindTouch({
        el: canvas,
        touchCallback: (touches) => {
            touches.forEach((t) => downHandler(t, myTool))
            touches.forEach((t) => {
                t.metadata = { tool: myTool }
            })
            remoteTouchCallback(touches)
        },
        dragCallback: (touches) => {
            touches.forEach((t) => moveHandler(t, myTool))
            remoteTouchCallback(touches)
        },
        touchEndCallback: (touches) => {
            // The last finger's touchend has an empty TouchList, so bindTouch
            // emits one up event with no uid. Close the local strokes and tell
            // the peer which pointers actually ended.
            const synthetic = touches.some((t) => t.uid == null)
            if (synthetic) {
                const uids = Object.keys(touchStates).filter((uid) => String(uid).indexOf('other') !== 0)
                const outgoing = uids.map((uid) => ({
                    x: -1,
                    y: -1,
                    uid,
                    type: 'up',
                    index: touchStates[uid].lastIndex + 1,
                }))
                outgoing.forEach((t) => upHandler(t, myTool))
                remoteTouchCallback(outgoing.length ? outgoing : touches)
                return
            }
            touches.forEach((t) => upHandler(t, myTool))
            remoteTouchCallback(touches)
        },
    })

    const setOtherTouches = function (ots: DoodleTouch[]) {
        ots.forEach(touch => {
            touch.uid = "other" + touch.uid
            // A phone's last touchend is forwarded without an identifier.
            if (touch.type == "up" && (touch.uid == "otherundefined" || touch.uid == "othernull")) {
                Object.keys(touchStates)
                    .filter((uid) => String(uid).indexOf('other') === 0)
                    .forEach((uid) => upHandler({ ...touch, uid }, otherTool))
                return
            }
            if (touch.type == "down") {

                otherTool = touch?.metadata?.tool ?? otherTool
                console.log("Other color picked!")

                downHandler(touch, otherTool)
            } else if (touch.type == "up") {
                upHandler(touch, otherTool)
            } else if (touch.type == "move") {
                moveHandler(touch, otherTool)
            } else {
                console.error("Uh oh!!! Type is bad.")
            }
        })
    }

    let remoteTouchCallback = (_) => _
    const onTouches = function (callback) {
        remoteTouchCallback = callback
    }

    const restore = function (snapshot: ImageData) {
        ctx.putImageData(snapshot, 0, 0)
    }

    return {
        stopTime() { },
        setOtherTouches,
        onTouches,
        setTool(t) {
            myTool = t
        },
        setCanvas(data) {
            const img = new Image
            img.onload = () => {
                ctx.drawImage(img, 0, 0)
                // A full-canvas sync (join, or the other person's undo/redo)
                // replaces this bitmap, so local before-snapshots no longer apply.
                undoStack.length = 0
                redoStack.length = 0
                pendingSnapshot = null
                strokeChanged = false
                notifyHistory()
            }
            img.src = data
        },
        getCanvas() {
            return canvas.toDataURL()
        },
        undo() {
            if (openStrokes > 0 || undoStack.length === 0) return false
            redoStack.push(takeSnapshot())
            if (redoStack.length > HISTORY_LIMIT) redoStack.shift()
            restore(undoStack.pop())
            notifyHistory()
            return true
        },
        redo() {
            if (openStrokes > 0 || redoStack.length === 0) return false
            undoStack.push(takeSnapshot())
            if (undoStack.length > HISTORY_LIMIT) undoStack.shift()
            restore(redoStack.pop())
            notifyHistory()
            return true
        },
        historyState,
        onHistoryChange(cb) {
            historyListener = cb
        },
    }
}

function pixelCoord(value, limit) {
    if (!Number.isFinite(value)) return -1
    const n = Math.floor(value)
    if (n === limit) return limit - 1
    if (n < 0 || n >= limit) return -1
    return n
}

function hexToRgb(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
    ] : null
}
