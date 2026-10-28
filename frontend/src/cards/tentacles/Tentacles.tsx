import { useUpdateEffect } from "ahooks"
import React, { useEffect, useRef } from "react"
import { useState } from "react"
import styled from "styled-components"
import { useAppContext } from "../../context"
import { emitDataEvent, onDataEvent } from "../../connection/dataConn"
import { useScene } from "../../hooks"
import { hexToHsv, hsvToHex } from "../../lib/colorUtils"
import createScene, { TentacleScreenInfo } from "./scene"
import { TentacleSettings } from "./settings"

export default function Tentacles(): JSX.Element {
    const {
        aspect: { screenInfo, used: aspectRatio },
        callerType,
        isCallConnected,
        reload$,
        settings,
    } = useAppContext()
    const { drawer: {
        colors: { value: colors },
        hasJellyHead: { value: hasJellyHead },
        isGame: { value: isGameV },
        width: { value: width } } } = settings as TentacleSettings
    const isHost = callerType === 'host' || !isCallConnected
    const isGame = isGameV as boolean
    const [score0, setScore0] = useState(0)
    const [score1, setScore1] = useState(0)
    onDataEvent("Tentacles-score", ([x, y]: [number, number]) => {
        setScore0(x)
        setScore1(y)
    })
    useEffect(() => {
        if (isHost) {
            emitDataEvent("Tentacles-score", [score0, score1])
        }
    }, [isHost, score0, score1])
    const pointFor0 = isGame ? () => setScore0(n => n + 1) : undefined
    const pointFor1 = isGame ? () => setScore1(n => n + 1) : undefined
    const screenInfoRef = useRef<TentacleScreenInfo>({
        ...screenInfo,
        isHost,
        hasJellyHead: hasJellyHead as boolean,
        isGame,
        bgColor: colors[2],
        pointFor0,
        pointFor1
    })
    const bgColor = colors[2]
    useEffect(() => {
        screenInfoRef.current.isHost = isHost
        screenInfoRef.current.bgColor = bgColor
    }, [isHost, bgColor])
    useUpdateEffect(() => reload$.emit(null), [hasJellyHead, isGame, isHost])
    const [ref] = useScene((n: HTMLCanvasElement, si) => {
        Object.assign(screenInfoRef.current, si)
        return createScene(n, screenInfoRef.current)
    })
    return <div style={{ background: toCssBackground(colors) }}>
        {isGame && <>
            <ScoreDiv i={0} color={colors[0]}>{score0}</ScoreDiv>
            <ScoreDiv i={1} color={colors[1]}>{score1}</ScoreDiv>
        </>}
        <canvas
            ref={ref}
            width={width}
            height={width / aspectRatio} // A = W/H -> H = W/A
            style={{
                // transform: `scale(${scale}, ${scale})`,
                // transformOrigin: 'top left',
                width: '100%',
                // boxSizing: "border-box",
                // border: "1px solid red",
            }}
        >
        </canvas>
    </div>

}

const ScoreDiv = styled.div<{ color: string, i: number }>`
    position: absolute;
    color: ${p => p.color};
    left: 50%;
    top: ${p => p.i === 0 ? '5%' : '90%'};
    font-size: 5em;
    pointer-events: none;
`

function toCssBackground(colors) {
    const { h, s, v } = hexToHsv(colors[2])
    const s2 = s === 0 ? 0 : Math.min(s + 20, 100)
    const v2 = Math.max(v - 20, 0)
    const c2 = hsvToHex({ h, s: s2, v: v2 })
    return `radial-gradient(ellipse at center, ${colors[2]} 0%, ${c2} 100%)`
}
