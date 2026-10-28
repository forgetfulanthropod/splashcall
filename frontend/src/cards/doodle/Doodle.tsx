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

interface DoodleTouch extends Touch { metadata?: { tool: { name, color?, size?} } }
interface DoodleApi extends SceneApi {
    setTool: (color) => void
    setCanvas: (d: string) => void
    getCanvas: () => string
}

const CANVAS_WIDTH = 1200

const ButtonContainer = styled.div`
    position: absolute;
    bottom: 80px;
    right: 14px;
    width: 50px;
    border: none;
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

    function setToolId(id) {
        setTool(tools.find(t => t.name == id))
    }

    function setToolSize(size) {
        const updated = { ...tool, ...{ size } }
        setTool(updated)
        tools[tools.findIndex(t => updated.name === t.name)] = updated
    }

    const rootRef = useRef(null)
    const size = useSize(rootRef)
    const canvasToDisplayPixelRatio = size.width / CANVAS_WIDTH

    return <div style={{ width: "100%", borderRadius: '12px' }} ref={rootRef}>
        <canvas ref={onRef} style={{ width: "100%" }} />
        <ButtonContainer>
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

    const fillColor = function (x, y, color) {

        const oldRGB = ctx.getImageData(x, y, 1, 1).data
        const newRGB = hexToRgb(color)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const tolerance = 0

        for (let i = 0; i < imageData.data.length; i += 4) {
            if (Math.abs(imageData.data[i] - oldRGB[0]) <= tolerance &&
                Math.abs(imageData.data[i + 1] - oldRGB[1]) <= tolerance &&
                Math.abs(imageData.data[i + 2] - oldRGB[2]) <= tolerance
            ) {
                imageData.data[i] = newRGB[0]
                imageData.data[i + 1] = newRGB[1]
                imageData.data[i + 2] = newRGB[2]
            }
        }

        ctx.putImageData(imageData, 0, 0)
    }


    const eventToXY = function (e) {
        const rect = canvas.getBoundingClientRect()
        const offsetLeft = rect.left
        const offsetTop = rect.top

        return [e.clientX - offsetLeft, e.clientY - offsetTop]
    }


    let touchStates = {}
    const downHandler = function (touch, tool) {
        touchStates[touch.uid] = { lastX: touch.x, lastY: touch.y, lastIndex: 0 }
        if (tool.name == 'brush')
            drawCircle(touch.x, touch.y, tool.size, tool.color)
        else if (tool.name == 'bucket')
            fillColor(touch.x, touch.y, tool.color)
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
        delete touchStates[touch.uid]
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
            touches.forEach((t) => upHandler(t, myTool))
            remoteTouchCallback(touches)
        },
    })

    const setOtherTouches = function (ots: DoodleTouch[]) {
        ots.forEach(touch => {
            touch.uid = "other" + touch.uid
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

    return {
        stopTime() { },
        setOtherTouches,
        onTouches,
        setTool(t) {
            myTool = t
        },
        setCanvas(data) {
            const img = new Image
            img.onload = () => ctx.drawImage(img, 0, 0)
            img.src = data
        },
        getCanvas() {
            return canvas.toDataURL()
        }
    }
}

function hexToRgb(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
    ] : null
}
