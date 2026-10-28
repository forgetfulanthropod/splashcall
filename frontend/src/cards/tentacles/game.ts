// TODO: stunning when you hit eachother
// TODO: better location sync

import { emitDataEvent, onDataEvent } from '../../connection/dataConn'
import { hexToHsv } from '../../lib/colorUtils'
import { rand, random } from '../../utils'
import { drawDot } from "../canvasUtils"
import { Monster } from './monster'
import { Point, TentacleScreenInfo } from './scene'
import { defaultMonsterSettings } from './settings'

interface GameData {
    gameDot: Point
    showAt: number
    uid: string
}
export function initializeGame(si: TentacleScreenInfo, width: number, height: number): {
    drawGameDot: (ctx: CanvasRenderingContext2D) => void
    updateGameState: (si: TentacleScreenInfo, m0: Monster, m1: Monster) => void
} {
    let hasScored0 = false
    let hasScored1 = false
    const gameData: GameData = {
        gameDot: null,
        showAt: Infinity,
        uid: null,
    }
    let lastRequestSent = 0
    if (si.isHost) {
        onDataEvent("Tentacles-requestGameDot", () => { emitDataEvent("Tentacles-gameDot", gameData) })
    }
    newGameDot()
    onDataEvent("Tentacles-gameDot", (data: GameData) => { Object.assign(gameData, data) })
    onDataEvent("Tentacles-guestScored", (uid: string) => {
        if (si.isHost && !hasScored1 && gameData.uid === uid) {
            hasScored1 = true
            si.pointFor1()
        }
    })

    function newGameDot() {
        if (si.isGame && si.isHost) {
            gameData.gameDot = { x: random(0, width), y: random(0, height) }
            gameData.showAt = Date.now() + random(500, 1500)
            gameData.uid = rand()
            hasScored0 = false
            hasScored1 = false
            emitDataEvent("Tentacles-gameDot", gameData)
        }
    }

    function updateGameState(si: TentacleScreenInfo, m0: Monster, m1: Monster): void {
        if (si.isGame && gameData.gameDot != null && Date.now() > gameData.showAt) {
            const scored0 = distanceOf(m0.center, gameData.gameDot) < defaultMonsterSettings.headRadius
            const scored1 = distanceOf(m1.center, gameData.gameDot) < defaultMonsterSettings.headRadius
            if (si.isHost) {
                if (scored0 && !hasScored0) {
                    hasScored0 = true
                    si.pointFor0()
                }
                if (scored1 && !hasScored1) {
                    hasScored1 = true
                    si.pointFor1()
                }
                if (scored0 || scored1) {
                    newGameDot()
                }
            } else {
                if (scored1) {
                    emitDataEvent("Tentacles-guestScored", gameData.uid)
                    gameData.gameDot = null
                }
            }
        }
        if (!si.isHost && gameData.gameDot == null && Date.now() - lastRequestSent > 500) {
            lastRequestSent = Date.now()
            emitDataEvent("Tentacles-requestGameDot", null)
        }
    }

    function drawGameDot(ctx: CanvasRenderingContext2D): void {
        if (si.isGame && gameData.gameDot != null && Date.now() > gameData.showAt) {
            drawDot(ctx, gameData.gameDot, calcGameDotColor(si.bgColor), 10) //
        }
    }


    return { drawGameDot, updateGameState }
}

function distanceOf(p: Point, q: Point) {
    const dx = p.x - q.x
    const dy = p.y - q.y
    return Math.sqrt(dx * dx + dy * dy)
}

function calcGameDotColor(bgcolor: string): string {
    const { h } = hexToHsv(bgcolor)
    if (h > 30 && h < 70) return '#cd59ff'
    return 'yellow'
}
