import React, { useEffect, useState } from 'react'
import pinch from 'touch-pinch'

import { emitDataEvent, onDataEvent } from '../connection/dataConn'
import { useScene } from '../hooks'
import { bindTouch, SceneApi } from '../textureUtils'
import styled, { CSSProperties } from 'styled-components'
import { noSelect } from '../css-snippets.json'

import RefreshSvg from 'assets/icons/refresh.svg'
import { useAppContext } from 'context'

const Refresh = styled.img`
    cursor: pointer;
    position: absolute;
    bottom: 100px;
    width: 30px;
    left: 20px;
`

const FoldButton = styled.div<{ isFolded: boolean }>`
    ${noSelect}
    border: none;
    color: #666;
    font-weight: bolder;
    font-size: 40px;
    ${p => p.isFolded ? `
        font-size: 40px;
        line-height: 100px;
    `: `
        font-size: 45px;
        line-height: 0px;
    `}
    border-radius: 50%;
    margin-top: 12px;
    position: absolute;
    bottom: 60px;
    left: 50%;
    transform: translateX(-50%);
    @media only screen and (max-width: 375px){
        transform: translateX(-50%) scale(.7);
    }
    text-align: center;
    cursor: pointer;
    & > :first-child {
        ${p => p.isFolded ? `
            width: 0;
            border-bottom: 50px solid #ffff99;
            border-left: 87px solid transparent;
            border-right: 87px solid transparent;
        `: ''
    }
    }
    & > :nth-child(2) {
        ${p => p.isFolded ? `
            width: 174px;
            height: 100px;
            background-color: #ffff99;
        `: `
            position: relative;
            top: 60px;
            z-index: 10;
        `}
    }
    & > :last-child {
        ${p => p.isFolded ? `
            width: 0;
            border-top: 50px solid #ffff99;
            border-left: 87px solid transparent;
            border-right: 87px solid transparent;
        `: `
            position: relative;
            z-index: 9;

            width: 0;
            height: 0;
            border-style: solid;
            border-width: 148px 83px 0 0;
            border-color: #ffff99 transparent transparent transparent;
        `}
    }
`
const canvasOverlayStyle: CSSProperties = { maxWidth: '100%', width: '100%', height: '100%', position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, pointerEvents: 'none' }


interface SnowflakeSceneApi extends SceneApi {
    onSendFlake: (cb: (flake) => void) => void
    setFlake: (flake) => void
    fold: () => void
    unfold: () => void
    onFoldUpdated: (cb) => void
    refresh: () => void
}

export default function Snowflake(): JSX.Element {
    const { myName } = useAppContext()
    const isDisplayOnly = myName == 'wonderville'
    const [onRef, scene] = useScene((wrap, screen) => createScene(wrap, screen, isDisplayOnly))
    const [isFolded, setIsFolded] = useState(true)
    useEffect(() => {
        if (scene == null) return

        onDataEvent('setFlake', flake => {
            scene.setFlake(flake)
        })
        scene.onSendFlake(flake => {
            emitDataEvent('setFlake', flake)
        })
        scene.onFoldUpdated(isFolded => setIsFolded(isFolded))
    }, [scene, setIsFolded])

    function toggleFold() {
        isFolded ? scene.unfold() : scene.fold()
        setIsFolded(!isFolded)
    }

    return <div>
        <div ref={onRef}>
            <canvas style={{ maxWidth: '100%', width: '100%', height: '100%', }} />
            <canvas style={canvasOverlayStyle} />
            <canvas style={canvasOverlayStyle} />
            <canvas style={canvasOverlayStyle} />
        </div>


        <Refresh {...{ isFolded }} onClick={() => scene.refresh()} src={RefreshSvg} />
        {!isDisplayOnly && <FoldButton {...{ isFolded }} onClick={() => toggleFold()}>
            <div></div>
            <div>{isFolded ? 'UNFOLD' : 'FOLD'}</div>
            <div></div>
        </FoldButton>}
    </div>
}

function createScene(wrap, { width: WIDTH, height: HEIGHT }, displayOnly: boolean): SnowflakeSceneApi {

    const canvasWidth = 1200
    const canvasHeight = canvasWidth * HEIGHT / WIDTH

    let isFolded = true
    let isDraggingOther = false

    let flakeColor = '#fff'
    let backgroundColor = '#74A7E0'
    let cutColor = '#fff'

    for (let i = 0; i < wrap.children.length; i++) {
        const canvas = wrap.children[i]
        canvas.width = canvasWidth
        canvas.height = canvasHeight
    }

    const bgCanvas = wrap.children[0]
    const foldedCanvas = wrap.children[1]
    const unfoldedCanvas = wrap.children[2]
    const otherFlakeCanvas = wrap.children[3]
    const bgCtx = bgCanvas.getContext('2d')
    const foldedCtx = foldedCanvas.getContext('2d')
    const unfoldedCtx = unfoldedCanvas.getContext('2d')
    const otherFlakeCtx = otherFlakeCanvas.getContext('2d')

    let otherFlakeScale = displayOnly ? 1.5 : .33
    let otherFlakeImg
    let isPinching = false
    let otherFlakeOffsetX = displayOnly ? -canvasWidth * .28 : 0
    let otherFlakeOffsetY = displayOnly ? -canvasHeight * .5 : 0

    let updateIsFolded = cb => void cb
    let touchCallback = cb => void cb
    let sendFlake = cb => void cb

    const foldedDimensions = (() => {
        const heightToWidth = 1 / Math.sqrt(3)
        const y1 = canvasHeight * .1
        const y2 = canvasHeight * .7
        const height = y2 - y1
        const width = heightToWidth * (y2 - y1)
        const x1 = canvasWidth / 2 - width / 2
        const x2 = canvasWidth / 2 + width / 2

        return { y1, y2, height, width, x1, x2, }
    })()

    fillBackground()
    function fillBackground() {
        bgCtx.fillStyle = backgroundColor
        bgCtx.fillRect(0, 0, canvasWidth, canvasHeight)
    }

    refresh()
    function refresh() {
        if (displayOnly) return
        fold()

        foldedCtx.setTransform(1, 0, 0, 1, 0, 0)
        foldedCtx.clearRect(0, 0, canvasWidth, canvasHeight)
        foldedCtx.beginPath()
        foldedCtx.moveTo(foldedDimensions.x1, foldedDimensions.y1)
        foldedCtx.lineTo(foldedDimensions.x2, foldedDimensions.y2)
        foldedCtx.lineTo(foldedDimensions.x2, foldedDimensions.y1)
        foldedCtx.closePath()
        foldedCtx.clip()
        foldedCtx.fillStyle = flakeColor
        foldedCtx.fill()

        // Reset transformation matrix to the identity matrix

        drawSnowflake()
    }

    function drawSnowflake() {
        unfoldedCtx.clearRect(0, 0, canvasWidth, canvasHeight)
        const xOffset = canvasWidth / 5
        const yOffset = canvasHeight / 10
        unfoldedCtx.translate(xOffset, yOffset)
        const scale = .35
        unfoldedCtx.scale(scale, scale)
        unfoldedCtx.drawImage(foldedCanvas, 0, 0)
        unfoldedCtx.translate(canvasWidth + foldedDimensions.width, 0)
        unfoldedCtx.scale(-1, 1)
        unfoldedCtx.drawImage(foldedCanvas, 0, 0)

        const transformedX2 = foldedDimensions.x2 * scale + xOffset
        const transformedY2 = foldedDimensions.y2 * scale + yOffset

        unfoldedCtx.setTransform(1, 0, 0, 1, 0, 0)
        // unfoldedCtx.translate(0, 20)
        unfoldedCtx.translate(0, transformedY2 * 2)
        unfoldedCtx.scale(1, -1)
        unfoldedCtx.drawImage(unfoldedCanvas, 0, 0)
        unfoldedCtx.setTransform(1, 0, 0, 1, 0, 0)


        unfoldedCtx.translate(transformedX2, transformedY2)
        unfoldedCtx.rotate(Math.PI / 3)
        // unfoldedCtx.translate(canvasWidth / 2, canvasHeight / 2)
        unfoldedCtx.drawImage(unfoldedCanvas, -transformedX2, -transformedY2)

        unfoldedCtx.rotate(Math.PI / 3)
        unfoldedCtx.drawImage(unfoldedCanvas, -transformedX2, -transformedY2)

        // Reset transformation matrix to the identity matrix
        unfoldedCtx.setTransform(1, 0, 0, 1, 0, 0)

        sendFlake(unfoldedCanvas.toDataURL())
    }

    let lastTouch


    bindTouch({
        el: bgCanvas,
        touchCallback(touches) {
            touchCallback(touches)
            if (isPinching) return

            const { x, y } = touches[0]

            isDraggingOther = testCoords(x, y, otherFlakeCtx)
            if (isDraggingOther) {
                lastTouch = touches[0]
            }

            if (!isFolded) return

            foldedCtx.save() // allows us to restore ctx settings after touch end
            // foldedCtx.globalCompositeOperation = 'destination-out'
            foldedCtx.beginPath()
            // foldedCtx.lineCap = 'round'
            foldedCtx.moveTo(x, y)
        },
        dragCallback(touches) {
            touchCallback(touches)
            if (isPinching) return
            if (isDraggingOther) {
                const dx = touches[0].x - lastTouch.x
                const dy = touches[0].y - lastTouch.y
                moveOtherFlake(dx, dy)
                lastTouch = touches[0]
                return
            }
            if (!isFolded) return

            const { x, y } = touches[0]
            foldedCtx.strokeStyle = cutColor
            foldedCtx.lineWidth = 1
            foldedCtx.lineTo(x, y)
            foldedCtx.stroke()
        },
        touchEndCallback(touches) {
            touchCallback(touches)
            if (isPinching) return

            isDraggingOther = false

            if (!isFolded) return

            foldedCtx.closePath()
            foldedCtx.fillStyle = cutColor
            foldedCtx.fill()
            foldedCtx.strokeStyle = cutColor
            foldedCtx.lineWidth = 3
            foldedCtx.stroke()
            foldedCtx.restore()

            drawSnowflake()
        }
    })

    pinch(bgCanvas)
        .on('start', () => {
            isPinching = true
        })
        .on('change', (dist, prev) => {
            otherFlakeScale += (dist - prev) / canvasHeight

            if (otherFlakeScale > 1.5) otherFlakeScale = 1.5
            if (otherFlakeScale < .33) otherFlakeScale = .33

            drawOtherFlake()
        })
        .on('end', () => {
            isPinching = false
        })

    function drawOtherFlake() {
        otherFlakeCtx.clearRect(0, 0, canvasWidth, canvasHeight)

        otherFlakeCtx.translate(canvasWidth * .1 + otherFlakeOffsetX, canvasHeight * .4 + otherFlakeOffsetY)
        otherFlakeCtx.scale(otherFlakeScale, otherFlakeScale)
        otherFlakeCtx.drawImage(otherFlakeImg, 0, 0)
        otherFlakeCtx.setTransform(1, 0, 0, 1, 0, 0)
    }

    function setOtherFlake(flake) {
        otherFlakeImg = new Image
        otherFlakeImg.onload = () => {
            drawOtherFlake()
        }
        otherFlakeImg.src = flake
    }

    function moveOtherFlake(dx, dy) {
        otherFlakeOffsetX += dx
        otherFlakeOffsetY += dy

        drawOtherFlake()
    }

    function testCoords(x, y, context): boolean {
        return context.getImageData(x, y, 1, 1).data.toString().slice(0, 7) !== '0,0,0,0'
    }

    function unfold() {
        foldedCanvas.style.opacity = 0
        unfoldedCanvas.style.opacity = 1

        isFolded = false
        updateIsFolded(isFolded)

        drawSnowflake()
    }
    function fold() {
        unfoldedCanvas.style.opacity = 0
        foldedCanvas.style.opacity = 1

        isFolded = true
        updateIsFolded(isFolded)
    }

    return {
        onTouches(cb) { touchCallback = cb },
        setOtherTouches() { },
        stopTime() { },
        onSendFlake(cb) { sendFlake = cb },
        setFlake(flake) { setOtherFlake(flake) },
        unfold,
        fold,
        onFoldUpdated(cb) { updateIsFolded = cb },
        refresh,
        setSettings(settings) {

            console.log('setting settings', { settings })

            if (settings.drawer.colors == null) return

            backgroundColor = settings.drawer.colors['value'][0]
            fillBackground()
            cutColor = settings.drawer.colors['value'][1]

            const flakeChanged = flakeColor !== settings.drawer.colors['value'][2]
            flakeColor = settings.drawer.colors['value'][2]
            if (flakeChanged) refresh()

        }
    }
}
