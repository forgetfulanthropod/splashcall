import React, { useEffect, useRef, useState } from 'react'

import { useAppContext } from '../context'
import { useScene } from '../hooks'
import { bindTouch, SceneApi } from '../textureUtils'
import { range } from 'd3-array'
import { clearDataEvent, emitDataEvent, onDataEvent } from '../connection/dataConn'
import styled from 'styled-components'
import { hexToRgba } from '../lib/colorUtils'


const WinPopUp = styled.div`
    background: white;
    border: 1px solid #666;
    border-radius: 6px;
    text-align: center;
    padding: 22px;
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%,-50%);
    z-index: 10;
`

const Header = styled.div`
    font-size: 30px;
`
const Time = styled.div`
    display: flex;
    margin: 12px;
    justify-content: center;
    align-items: center;
    .label {
        color: #666;
        margin-right: 12px;
    }
    .time {
        background: white;
        border: 1px solid #666;
        padding: 6px;
        border-radius: 6px;
        font-family: monospace;
    }
`
const GoButton = styled.div`
    background: #7DF59F;
    border: 1px solid #666;
    color: white;
    font-weight: bolder;
    font-size: 90px;
    line-height: 222px;
    width: 222px;
    height: 222px;
    border-radius: 50%;
    margin-top: 12px;
`

interface Coords {
    x: number
    y: number
}
interface MazeSceneApi extends SceneApi {
    init: (isHost, settings) => void
    onMazeReady: (fn) => void
    setMaze: (maze) => void
    onGameOver: (fn) => void
    onSendCoords: (fn: (c: Coords) => void) => void
    setOtherCoords: (c: Coords) => void
    setDifficulty: (n) => void
}

export default function Maze(): JSX.Element {
    const { callerType, settings } = useAppContext()
    const [maze, setMaze] = useState()
    const [showMaze, setShowMaze] = useState(true)
    const [showWinPopUp, setShowWinPopUp] = useState(false)
    const [startTime, setStartTime] = useState(0)
    const [elapsed, setElapsed] = useState('')
    const callerTypeRef = useRef(callerType)
    callerTypeRef.current = callerType
    const remoteMazeRef = useRef(null)

    const [onRef, scene] = useScene(createScene)

    useEffect(() => {
        if (scene == null || callerType == null) return
        scene.init(callerType === 'host', settings)
    }, [callerType, scene, settings])

    useEffect(() => {
        emitDataEvent('mazeRefresh', null)
    }, [])

    useEffect(() => {
        if (scene == null) { return }

        scene.onMazeReady(maze => {
            setMaze(maze)
            setStartTime((new Date()).getTime())
        })
        onDataEvent('maze', incoming => {
            if (incoming == null) return
            if (callerTypeRef.current == 'guest') {
                remoteMazeRef.current = null
                scene.setMaze(incoming)
                return
            }
            remoteMazeRef.current = incoming
        })
        onDataEvent('mazeRefresh', () => {
            setShowWinPopUp(false)
            setShowMaze(false)
        })

        scene.onSendCoords(coords => emitDataEvent('mazeCoords', coords))
        onDataEvent('mazeCoords', (coords: Coords) => { scene.setOtherCoords(coords) })
    }, [scene])

    useEffect(() => {
        if (scene == null) { return }
        scene.onGameOver(() => {
            const totalSecondsElapsed = ((new Date()).getTime() - startTime) / 1000 | 0
            const minutes = totalSecondsElapsed / 60 | 0
            const seconds = totalSecondsElapsed % 60 | 0
            setElapsed((minutes ? `${minutes} minutes ` : '') + `${seconds} seconds`)

            setShowWinPopUp(true)
        })
    }, [scene, startTime])

    useEffect(() => {
        if (callerType == 'host' && maze != null) {
            emitDataEvent('maze', maze)
        }
    }, [callerType, maze])

    useEffect(() => {
        if (callerType != 'guest' || scene == null) return
        const incoming = remoteMazeRef.current
        if (incoming == null) return
        remoteMazeRef.current = null
        scene.setMaze(incoming)
    }, [callerType, scene])

    useEffect(() => {
        if (!showMaze) setShowMaze(true)
    }, [showMaze])

    useEffect(() => {
        const difficulty = settings?.drawer?.difficulty?.value
        if (scene == null || difficulty == null) return
        scene.setDifficulty(difficulty)
    }, [scene, settings])

    return <div style={{ background: '#666', textAlign: 'center' }}>
        {
            showWinPopUp &&
            <WinPopUp>
                <span onClick={() => setShowWinPopUp(false)} style={{ float: 'right', fontFamily: 'monospace', cursor: 'pointer' }}>x</span>
                <Header>{"Y'ALL WIN!"}</Header>
                <Time>
                    <div className="label">time</div>
                    <div className="time">{elapsed}</div>
                </Time>
                <span>again?</span>
                <GoButton onClick={() => {
                    setShowWinPopUp(false)
                    setShowMaze(false)
                    emitDataEvent('mazeRefresh', null)
                }}>
                    GO
                </GoButton>
            </WinPopUp>
        }
        {
            showMaze &&
            <div style={{ maxWidth: '95%', margin: 'auto', position: 'relative' }} ref={onRef}>
                {[1, 2, 3, 4, 5].map(i => <canvas key={i} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', maxWidth: '100%' }} />)}
            </div>
        }
    </div>
}

function createScene(wrapEl, screenInfo): MazeSceneApi {

    const WIDTH = 1200
    const HEIGHT = 1200

    wrapEl.style.height = `${screenInfo.height}px`

    let CELL_SIZE, CELL_SPACING, CELL_WIDTH, CELL_HEIGHT
    assignCellData(30)

    function assignCellData(size) {

        CELL_SIZE = size
        CELL_SPACING = CELL_SIZE / 2
        CELL_WIDTH = Math.floor(
            (WIDTH - CELL_SPACING) / (CELL_SIZE + CELL_SPACING)
        )
        CELL_HEIGHT = Math.floor(
            (HEIGHT - CELL_SPACING) / (CELL_SIZE + CELL_SPACING)
        )

    }

    let isHost = true
    let playerRGB = [235, 173, 255]
    let otherRGB = [125, 245, 159]

    let lastCoords
    let otherCoords

    const touchCanvas: HTMLCanvasElement = wrapEl.children[0]
    touchCanvas.width = WIDTH
    touchCanvas.style.width = Math.min(screenInfo.width, screenInfo.height) + 'px'
    touchCanvas.height = WIDTH / screenInfo.width * screenInfo.height

    const mazeCanvas: HTMLCanvasElement = wrapEl.children[1]
    mazeCanvas.width = WIDTH
    mazeCanvas.style.width = Math.min(screenInfo.width, screenInfo.height) + 'px'
    mazeCanvas.height = HEIGHT
    const mazeCtx = mazeCanvas.getContext('2d')
    mazeCanvas.style.pointerEvents = 'none'

    const pathCanvas = wrapEl.children[2]
    pathCanvas.width = WIDTH
    pathCanvas.style.width = Math.min(screenInfo.width, screenInfo.height) + 'px'
    pathCanvas.height = HEIGHT

    pathCanvas.style.pointerEvents = 'none'

    const pathCtx = pathCanvas.getContext('2d')
    pathCtx.lineCap = 'round'

    const avatarCanvas = wrapEl.children[3]
    avatarCanvas.width = WIDTH
    avatarCanvas.style.width = Math.min(screenInfo.width, screenInfo.height) + 'px'
    avatarCanvas.height = HEIGHT

    avatarCanvas.style.pointerEvents = 'none'

    const avatarCtx = avatarCanvas.getContext('2d')

    const zoomAreaCanvas = wrapEl.children[4]
    zoomAreaCanvas.width = screenInfo.width
    zoomAreaCanvas.height = screenInfo.width + (screenInfo.height - screenInfo.width) / 2

    zoomAreaCanvas.style.top = 0
    zoomAreaCanvas.style.width = Math.min(screenInfo.width, screenInfo.height) + 'px'
    zoomAreaCanvas.style.transform = 'translateX(-50%)'

    zoomAreaCanvas.style.pointerEvents = 'none'

    const zoomAreaCtx = zoomAreaCanvas.getContext('2d')


    let cancelLastDrawMaze = false

    // eslint-disable-next-line
    let drawMazePromise = new Promise((res, rej) => { res(null) })
    generate()
    async function generate() {
        cancelLastDrawMaze = true
        await drawMazePromise
        cancelLastDrawMaze = false

        mazeCtx.setTransform(1, 0, 0, 1, 0, 0)
        mazeCtx.clearRect(0, 0, mazeCanvas.width, mazeCanvas.height)
        pathCtx.setTransform(1, 0, 0, 1, 0, 0)
        pathCtx.clearRect(0, 0, mazeCanvas.width, mazeCanvas.height)

        drawMazePromise = fillCanvasWithWilsonAlgorithm(mazeCtx).then(() => {
            otherCoords = lastCoords = {
                x: (CELL_WIDTH - 1) * CELL_SIZE + CELL_WIDTH * CELL_SPACING + CELL_SIZE / 2,
                y: (CELL_HEIGHT - 1) * CELL_SIZE + CELL_HEIGHT * CELL_SPACING + CELL_SIZE / 2
            }
            drawAvatar()
            sendMaze(mazeCanvas.toDataURL())

            bindMove()
            // bindOtherMove();
        })
    }

    function drawAvatar({ ctx, x, y } = { ctx: avatarCtx, x: lastCoords.x, y: lastCoords.y }) {
        ctx.beginPath()

        ctx.clearRect(0, 0, WIDTH, HEIGHT)
        ctx.arc(x, y, Math.max(CELL_SIZE, 17), 0, 2 * Math.PI)

        ctx.fillStyle = `rgb(${playerRGB})`
        ctx.fill()
        ctx.lineWidth = 2
        ctx.strokeStyle = '#333'
        ctx.stroke()

        drawOtherAvatar()
    }

    function drawOtherAvatar({ canvas, ctx, x, y } = { canvas: avatarCanvas, ctx: avatarCtx, x: otherCoords.x, y: otherCoords.y }) {
        if (testCoords(canvas.width - x, canvas.height - y, ctx)) gameOver()

        ctx.translate(canvas.width, canvas.height)
        ctx.scale(-1, -1)
        ctx.beginPath()
        ctx.arc(x, y, Math.max(CELL_SIZE, 20), 0, 2 * Math.PI)
        ctx.fillStyle = `rgb(${otherRGB})`
        ctx.fill()
        ctx.strokeStyle = '#333'
        ctx.lineWidth = 2
        ctx.stroke()

        ctx.setTransform(1, 0, 0, 1, 0, 0)


        pathCtx.translate(canvas.width, canvas.height)
        pathCtx.scale(-1, -1)
        pathCtx.fillStyle = `rgba(${otherRGB}, .8)`
        pathCtx.beginPath()
        pathCtx.arc(x, y, CELL_SIZE / 4, 0, Math.PI * 2)
        pathCtx.fill()
        pathCtx.setTransform(1, 0, 0, 1, 0, 0)
    }

    function drawZoomArea() {
        if (CELL_SIZE > 24 || screenInfo.width > screenInfo.height) return

        clearZoomArea()
        const ZOOM_RADIUS = 150


        function getOffset(region) {
            const regions = [.25, .3]
            let direction
            if (region < regions[0]) {
                direction = 1
            } else if (region >= regions[0] && region < regions[1]) {
                // slide from one offset to the other
                const dRegions = regions[1] - regions[0]
                direction = 1 + 2 * regions[0] / dRegions - 2 / dRegions * region
            } else {
                direction = -1
            }
            return direction * ZOOM_RADIUS
        }


        const xImageOffset = (zoomAreaCanvas.width - mazeCanvas.width) * lastCoords.x / mazeCanvas.width
        const yShift = getOffset(lastCoords.y / mazeCanvas.height)
        const yImageOffset = (zoomAreaCanvas.height - mazeCanvas.height) * lastCoords.y / mazeCanvas.height + yShift

        function xConvert(x) {
            return x * zoomAreaCanvas.width / mazeCanvas.width
        }
        function yConvert(y) {
            return y * zoomAreaCanvas.height / mazeCanvas.height + yShift
        }
        const xCenter = xConvert(lastCoords.x)
        const yCenter = yConvert(lastCoords.y)

        zoomAreaCtx.save()

        zoomAreaCtx.beginPath()
        zoomAreaCtx.arc(xCenter, yCenter, ZOOM_RADIUS, 0, 2 * Math.PI)
        zoomAreaCtx.fillStyle = '#666'
        zoomAreaCtx.fill()
        zoomAreaCtx.clip()


        zoomAreaCtx.drawImage(mazeCanvas, xImageOffset, yImageOffset)
        zoomAreaCtx.drawImage(pathCanvas, xImageOffset, yImageOffset)
        zoomAreaCtx.drawImage(avatarCanvas, xImageOffset, yImageOffset)

        zoomAreaCtx.restore()
    }

    function clearZoomArea() {
        zoomAreaCtx.clearRect(0, 0, zoomAreaCanvas.width, zoomAreaCanvas.height)
    }

    let dragTimeout = setTimeout(() => null, 0)
    function bindMove() {
        let onPath = false
        let avatarOffset = null
        const DRAG_UNIT = CELL_SPACING - 2

        bindTouch({
            el: touchCanvas,
            ignoreMouseOut: true,
            touchCallback(touches) {
                onPath = true
                drawZoomArea()
                avatarOffset = { x: touches[0].x - lastCoords.x, y: touches[0].y - lastCoords.y }

                pathCtx.fillStyle = `rgba(${playerRGB}, .75)`
                pathCtx.strokeStyle = `rgba(${playerRGB}, .75)`
                pathCtx.lineWidth = CELL_SIZE / 2
                pathCtx.arc(lastCoords.x, lastCoords.y, CELL_SIZE / 4, 0, Math.PI * 2)
            },
            dragCallback(touches) {
                if (!onPath) return

                const x = Math.floor(touches[0].x - avatarOffset.x)
                const y = Math.floor(touches[0].y - avatarOffset.y)

                mazeCtx.strokeStyle = '#FFF491'
                mazeCtx.lineWidth = 1
                const dx = x - lastCoords.x
                const dy = y - lastCoords.y
                const xDirection = dx < 0 ? -1 : (dx > 0 ? 1 : 0)
                const yDirection = dy < 0 ? -1 : (dy > 0 ? 1 : 0)

                clearTimeout(dragTimeout)
                yDrag()
                xDrag()

                // y drag
                function yDrag() {
                    let yWallLimited = lastCoords.y;
                    (function maxYDrag() {

                        if (yDirection === 0) return
                        const xesToTest = [
                            lastCoords.x - (xDirection || 1) * (CELL_SIZE / 4 - 1),
                            lastCoords.x,
                            lastCoords.x + (xDirection || 1) * (CELL_SIZE / 4 - 1)
                        ]
                        const yToTest = yWallLimited + CELL_SIZE / 4 * yDirection

                        const yDiff = Math.abs(y - yWallLimited)
                        const numPixelsInStep = yDiff > DRAG_UNIT ? DRAG_UNIT : (yDiff > 0 ? 1 : 0)

                        range(numPixelsInStep, 0, -1).reduce<boolean>((onePassed: boolean, diff) => {
                            if (onePassed) return true

                            const thisPasses = xesToTest.reduce<boolean>(
                                (allPassed: boolean, x) => allPassed && testCoords(x, yToTest + yDirection * diff),
                                true
                            )

                            if (thisPasses) yWallLimited += diff * yDirection

                            return thisPasses
                        }, false)

                        if (yWallLimited !== lastCoords.y) {
                            pathCtx.beginPath()
                            pathCtx.moveTo(lastCoords.x, lastCoords.y)
                            lastCoords = { x: lastCoords.x, y: yWallLimited }
                            pathCtx.lineTo(lastCoords.x, lastCoords.y)
                            pathCtx.stroke()

                            drawAvatar()
                            drawZoomArea()

                            clearTimeout(dragTimeout)
                            dragTimeout = setTimeout(maxYDrag, 0)
                        }

                        coordsCallback(lastCoords)
                    })()
                }

                // x drag
                function xDrag() {
                    let xWallLimited = lastCoords.x;
                    (function maxXDrag() {

                        if (xDirection === 0) return

                        const ysToTest = [
                            lastCoords.y - (yDirection || 1) * (CELL_SIZE / 4 - 1),
                            lastCoords.y,
                            lastCoords.y + (yDirection || 1) * (CELL_SIZE / 4 - 1)
                        ]
                        const xToTest = xWallLimited + CELL_SIZE / 4 * xDirection

                        const xDiff = Math.abs(x - xWallLimited)
                        const numPixelsInStep = xDiff > DRAG_UNIT ? DRAG_UNIT : (xDiff > 0 ? 1 : 0)

                        range(numPixelsInStep, 0, -1).reduce<boolean>((onePassed: boolean, diff) => {
                            if (onePassed) return true

                            const thisPasses = ysToTest.reduce<boolean>(
                                (allPassed: boolean, y) => allPassed && testCoords(xToTest + xDirection * diff, y),
                                true
                            )

                            if (thisPasses) xWallLimited += diff * xDirection

                            return thisPasses
                        }, false)

                        if (xWallLimited !== lastCoords.x) {

                            pathCtx.beginPath()
                            pathCtx.moveTo(lastCoords.x, lastCoords.y)
                            lastCoords = { x: xWallLimited, y: lastCoords.y }
                            pathCtx.lineTo(lastCoords.x, lastCoords.y)
                            pathCtx.stroke()

                            drawAvatar()
                            drawZoomArea()

                            clearTimeout(dragTimeout)
                            dragTimeout = setTimeout(maxXDrag, 0)

                            return
                        }

                        coordsCallback(lastCoords)
                    })()
                }
            },
            touchEndCallback() {
                // nothing
                onPath = false
                clearTimeout(dragTimeout)
                clearZoomArea()
            }
        })

    }

    function testCoords(x, y, context = mazeCtx): boolean {
        const pixel = context.getImageData(x, y, 1, 1)

        const onPath = !(pixel.data.toString().slice(0, 7) === '0,0,0,0')
        // //debug
        // if (onPath) {
        //     const pixel = context.createImageData(1, 1)
        //     Object.assign(pixel.data, [...playerRGB, 255])
        //     context.putImageData(pixel, x, y)
        // }
        return onPath

    }

    function fillCanvasWithWilsonAlgorithm(context) {
        const width = WIDTH,
            height = HEIGHT

        const N = 1 << 0,
            S = 1 << 1,
            W = 1 << 2,
            E = 1 << 3

        const cellSize = CELL_SIZE,
            cellSpacing = CELL_SPACING,
            cellWidth = CELL_WIDTH,
            cellHeight = CELL_HEIGHT,
            cells = new Array(cellWidth * cellHeight), // each cell’s edge bits
            remaining = range(cellWidth * cellHeight), // cell indexes to visit
            previous = new Array(cellWidth * cellHeight) // current random walk path
        let i0,
            x0,
            y0 // end of current random walk


        context.translate(
            Math.round(
                (width - cellWidth * cellSize - (cellWidth + 1) * cellSpacing) / 2
            ),
            Math.round(
                (height - cellHeight * cellSize - (cellHeight + 1) * cellSpacing) / 2
            )
        )

        // Add the starting cell.
        context.fillStyle = 'white'
        const start = remaining.pop()
        cells[start] = 0
        fillCell(start)

        // While there are remaining cells,
        // add a loop-erased random walk to the maze.
        context.fillStyle = 'rgb(173,252,255)'
        const interval = setInterval(function () {
            for (let k = 0; k < 50; ++k) {
                if (loopErasedRandomWalk() || cancelLastDrawMaze) {
                    clearInterval(interval)
                    finishCallback()
                }
            }
        }, 10)

        function loopErasedRandomWalk() {
            let i1

            // Pick a location that’s not yet in the maze (if any).
            if (i0 == null) {
                do if ((i0 = remaining.pop()) == null) return true
                while (cells[i0] >= 0)
                previous[i0] = i0
                fillCell(i0)
                x0 = i0 % cellWidth
                y0 = (i0 / cellWidth) | 0
                return false
            }

            // Perform a random walk starting at this location,
            // by picking a legal random direction.
            let keepWalking = true
            while (keepWalking) {
                i1 = (Math.random() * 4) | 0
                if (i1 === 0) {
                    if (y0 <= 0) continue
                    --y0, (i1 = i0 - cellWidth)
                } else if (i1 === 1) {
                    if (y0 >= cellHeight - 1) continue
                    ++y0, (i1 = i0 + cellWidth)
                } else if (i1 === 2) {
                    if (x0 <= 0) continue
                    --x0, (i1 = i0 - 1)
                } else {
                    if (x0 >= cellWidth - 1) continue
                    ++x0, (i1 = i0 + 1)
                }
                keepWalking = false
            }

            // If this new cell was visited previously during this walk,
            // erase the loop, rewinding the path to its earlier state.
            if (previous[i1] >= 0) eraseWalk(i0, i1)
            // Otherwise, just add it to the walk.
            else {
                previous[i1] = i0
                fillCell(i1)
                if (i1 === i0 - 1) fillEast(i1)
                else if (i1 === i0 + 1) fillEast(i0)
                else if (i1 === i0 - cellWidth) fillSouth(i1)
                else fillSouth(i0)
            }

            // If this cell is part of the maze, we’re done walking.
            if (cells[i1] >= 0) {
                // Add the random walk to the maze by backtracking to the starting cell.
                // Also erase this walk’s history to not interfere with subsequent walks.
                context.save()
                context.fillStyle = '#fff'
                fillCell(i1)
                while ((i0 = previous[i1]) !== i1) {
                    fillCell(i0)
                    if (i1 === i0 + 1) (cells[i0] |= E), (cells[i1] |= W), fillEast(i0)
                    else if (i1 === i0 - 1)
                        (cells[i0] |= W), (cells[i1] |= E), fillEast(i1)
                    else if (i1 === i0 + cellWidth)
                        (cells[i0] |= S), (cells[i1] |= N), fillSouth(i0)
                    else (cells[i0] |= N), (cells[i1] |= S), fillSouth(i1)
                    previous[i1] = NaN
                    i1 = i0
                }
                context.restore()

                previous[i1] = NaN
                i0 = null
            } else {
                i0 = i1
            }
            return false
        }

        function eraseWalk(i0, i2) {
            let i1
            context.save()
            context.globalCompositeOperation = 'destination-out'
            do {
                i1 = previous[i0]
                if (i1 === i0 - 1) fillEast(i1)
                else if (i1 === i0 + 1) fillEast(i0)
                else if (i1 === i0 - cellWidth) fillSouth(i1)
                else fillSouth(i0)
                fillCell(i0)
                previous[i0] = NaN
                i0 = i1
            } while (i1 !== i2)
            context.restore()
        }

        function fillCell(i) {
            const x = i % cellWidth,
                y = (i / cellWidth) | 0
            context.fillRect(
                x * cellSize + (x + 1) * cellSpacing,
                y * cellSize + (y + 1) * cellSpacing,
                cellSize,
                cellSize
            )
            //debug
            // if (i > cellWidth * cellHeight - 5)
            //     console.log('drawing cell: (cellx, celly,cellSize, cellSpacing, canvasx,canvasy,w,h)', x, y, cellSize, cellSpacing, x * cellSize + (x + 1) * cellSpacing,
            //         y * cellSize + (y + 1) * cellSpacing,
            //         cellSize,
            //         cellSize)
        }

        function fillEast(i) {
            const x = i % cellWidth,
                y = (i / cellWidth) | 0
            context.fillRect(
                (x + 1) * (cellSize + cellSpacing),
                y * cellSize + (y + 1) * cellSpacing,
                cellSpacing,
                cellSize
            )
        }

        function fillSouth(i) {
            const x = i % cellWidth,
                y = (i / cellWidth) | 0
            context.fillRect(
                x * cellSize + (x + 1) * cellSpacing,
                (y + 1) * (cellSize + cellSpacing),
                cellSize,
                cellSpacing
            )
        }

        let finishCallback
        const finishedPromise = new Promise((resolve) => {
            finishCallback = () => resolve(null)
        })

        return finishedPromise
    }


    function setOtherCoords(coords) {
        otherCoords = coords
        // console.log('received other coords:', otherCoords)
        if (lastCoords != null) drawAvatar()
    }

    function stopTime() {
        clearDataEvent('maze')
        clearDataEvent('mazeRefresh')
    }

    let coordsCallback = (_) => _
    function onSendCoords(callback) {
        coordsCallback = callback
    }

    async function setMaze(data) {
        // console.log('setting maze')
        await drawMazePromise

        // console.log('draw promise finished')
        const img = new Image
        img.onload = () => {

            mazeCtx.clearRect(0, 0, WIDTH, HEIGHT)
            // console.log('drawing new one')
            mazeCtx.translate(mazeCanvas.width, mazeCanvas.height)
            mazeCtx.scale(-1, -1)
            mazeCtx.drawImage(img, 0, 0)
            mazeCtx.setTransform(1, 0, 0, 1, 0, 0)

            sendMaze(mazeCanvas.toDataURL())
        }
        img.src = data
    }

    let sendMaze
    function onMazeReady(callback) {
        sendMaze = callback
    }

    let gameOver
    function onGameOver(callback) {
        gameOver = callback
    }

    function setSettings(s) {
        if (isHost) {
            playerRGB = getRGB(s.drawer.avatarColors.value[0])
            otherRGB = getRGB(s.drawer.avatarColors.value[1])
            if (lastCoords != null) drawAvatar()
        } else {
            playerRGB = getRGB(s.drawer.avatarColors.value[1])
            otherRGB = getRGB(s.drawer.avatarColors.value[0])
            if (lastCoords != null) drawAvatar()
        }
        function getRGB(hex) {
            const rgba = hexToRgba(hex)

            return [rgba.r, rgba.g, rgba.b]
        }
    }

    return {
        setOtherTouches: () => { },
        onTouches: () => { },
        onSendCoords,
        setOtherCoords,
        stopTime,
        init(_isHost: boolean, settings) {
            isHost = _isHost
            setSettings(settings)
        },
        setSettings,
        setMaze,
        onMazeReady,
        onGameOver,
        setDifficulty(d) {
            const difficultyToCellSize = [
                60, 50, 40, 30, 24, 22, 20, 18, 16, 14, 12, 10
            ]
            if (CELL_SIZE === difficultyToCellSize[d]) return

            assignCellData(difficultyToCellSize[d])
            generate()
        }
    }
}
