import React from 'react'
import omit from 'lodash/omit'

import {
    SliderInput,
    SliderTrack,
    SliderRange,
    SliderHandle,
    SliderOrientation,
} from "@reach/slider"
import "@reach/slider/styles.css"

export default function Slider(props: {
    min,
    max,
    value,
    onChange,
    style?,
    step?,
    vertical?: boolean,
    handleColor?: string,
    handleGrowRange?: [number, number],
    hasHandleLabel?: boolean,
}
): JSX.Element {

    const handleStyle = (() => {
        const style = {
            background: '#b3d7fe',
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%,-50%)',
            border: '1px solid gray',
            display: 'none'
        } as React.CSSProperties

        if (props.handleColor) {
            style.background = props.handleColor
            style.display = 'block'
        }

        if (props.handleGrowRange == null) return style

        const slope = (props.handleGrowRange[1] - props.handleGrowRange[0]) / (props.max - props.min)
        const handleSize = slope * (props.value - props.min) + props.handleGrowRange[0]

        return {
            ...{ width: `${handleSize}px`, height: `${handleSize}px`, borderRadius: '50%', display: 'block' },
            ...style,
        }
    })()

    const reachProps = omit(props, ['vertical', 'handleColor', 'handleGrowRange', 'hasHandleLabel'])

    return <SliderInput
        {...reachProps}
        orientation={props.vertical ? SliderOrientation.Vertical : SliderOrientation.Horizontal}
    >
        <SliderTrack style={{ border: '1px solid #a0a0a0' }} >
            <SliderRange style={{ background: 'transparent', }} />
            <SliderHandle style={{ background: '#b3d7fe', width: '28px', height: '28px', borderRadius: '50%', border: '1px solid #a0a0a0', outline: 'none' }}>
                <div style={handleStyle}></div>
                <span style={{ ...omit(handleStyle, ['display', 'border', 'background']) }}>
                    {props.hasHandleLabel ? props.value : ''}
                </span>
            </SliderHandle>
        </SliderTrack>
    </SliderInput>
}
