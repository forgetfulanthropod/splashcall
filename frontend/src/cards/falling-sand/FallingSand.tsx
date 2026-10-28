import React, { CSSProperties, useCallback, useEffect, useRef } from 'react'
import { useAppContext } from '../../context'
import { useScene } from '../../hooks'
import { SceneApi } from '../../textureUtils'
import runSandGame from './falling-sand'
import './styles.css'

export default function FallingSand(): JSX.Element {
    const mainCanvas = useRef()
    const menuWrapper = useRef()
    const elementTable = useRef()
    const pensize = useRef()
    const gameCanvas = useRef()
    const userstrokeCanvas = useRef()
    const offscreenParticleCanvas = useRef()
    const spigotControls = useRef()

    const { setSettings } = useAppContext()

    const createScene = useCallback((gameWrapper, screenInfo) => {
        const refsObj = { mainCanvas, menuWrapper, elementTable, pensize, gameCanvas, userstrokeCanvas, offscreenParticleCanvas, spigotControls }
        return runSandGame({ ...getRefCurrents(refsObj), gameWrapper }, screenInfo) as SceneApi
    }, [])
    const [gameWrapperRef, scene] = useScene(createScene)

    useEffect(() => {
        if (scene == null) { return }
        // scene.onSettingsChange(s => setSettings({ ...s }))
        scene.onSettingsChange(fss => setSettings(s => ({ ...s, other: { ...fss } })))

    }, [scene, setSettings])

    return <div ref={gameWrapperRef} className="wrapper falling-sand-wrapper fallingsand" id="gameWrapper">
        <canvas id="gameCanvas" ref={gameCanvas} style={{ display: 'none' }}>Your browser does not support HTML5 canvas.</canvas>
        <canvas id="mainCanvas" ref={mainCanvas} style={{ width: '100%' }}></canvas>
        <canvas id="userstrokeCanvas" ref={userstrokeCanvas} style={{ display: 'none', width: '100%' }}></canvas>
        <canvas id="offscreenParticleCanvas" ref={offscreenParticleCanvas} style={{ display: 'none' }}></canvas>
        <div id="menuWrapper" ref={menuWrapper}>
            <div style={{ display: 'flex' }}>
                <table id="elementTable" ref={elementTable}>
                </table>
                <div id="optionsCol1" className="optionsCol">
                    <div id="penSizeDiv">
                        <label htmlFor="pensize">Pen Size</label>
                        <select id="pensize" ref={pensize}></select>
                    </div>
                    <SpigotControls divRef={spigotControls} />
                </div>
            </div>
            <div id="optionsCol2" className="optionsCol" style={style1}>
            </div>
        </div>
    </div>
}

function getRefCurrents<T>(refsObj: Record<string, React.MutableRefObject<T>>): Record<string, T> {
    const obj = {}
    for (const [key, val] of Object.entries(refsObj)) {
        obj[key] = val.current
    }
    return obj
}


function SpigotControls(props: { divRef: React.MutableRefObject<HTMLDivElement> }): JSX.Element {
    const NUM_SPIGOTS = 4
    const spigots = []
    for (let i = 1; i <= NUM_SPIGOTS; i++) {
        spigots.push(
            <div key={i}>
                <select id={`spigot${i}Type`} className="spigotType"></select>
                <select id={`spigot${i}Size`}></select>
            </div>
        )
    }
    return <div ref={props.divRef}>{spigots}</div>
}

const style1: CSSProperties = {
    position: 'absolute',
    left: 'calc(50% - 20px)',
    bottom: '0'
}
