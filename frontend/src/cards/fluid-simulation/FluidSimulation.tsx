import React from 'react'
import { useScene } from '../../hooks'
import createScene from './fluid-simulation'

// TODO: Synchronize configuration (spouts & cursor type)

export default function FluidSimulation(): JSX.Element {
    const [canvasRef] = useScene(createScene)

    return <div style={{ width: '100%', height: '100%' }}>
        <canvas ref={canvasRef}
            style={{ width: '100%', height: '100%' }}
        ></canvas>
    </div>
}
