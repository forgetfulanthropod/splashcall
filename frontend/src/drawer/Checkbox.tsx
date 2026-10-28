import React from 'react'

import {
    CustomCheckboxContainer,
    CustomCheckboxInput,
} from '@reach/checkbox'
import '@reach/checkbox/styles.css'
import { CSSProperties } from 'styled-components'

type CustomCheckboxInputProps = React.ComponentProps<typeof CustomCheckboxInput>

export default function Checkbox(props: CustomCheckboxInputProps): JSX.Element {
    return (
        <CustomCheckboxContainer
            checked={props.checked}
            onChange={props.onChange}
            style={{ ...getContainerStyle(), ...props.style }}
        >
            <CustomCheckboxInput {...props} />
            <span aria-hidden style={getCheckStyle(props.checked)} />
        </CustomCheckboxContainer>
    )
}

function getContainerStyle() {
    return {
        background: 'rgba(240, 240, 250, 0.8)',
        border: '1px solid #999',
        borderRadius: '4px',
        height: 26,
        width: 26,
    }
}

function getCheckStyle(checked): CSSProperties {
    return {
        display: 'block',
        position: 'absolute',
        width: '60%',
        height: '60%',
        top: '50%',
        left: '50%',
        transform: `translate(-50%, -50%) scaleX(${checked != null ? 1 : 0}) scaleY(${checked === true ? 1 : checked === 'mixed' ? 0.4 : 0
            })`,
        transition: 'transform 200ms ease-out, background 200ms ease-out',
        zIndex: 1,
        background:
            checked === true
                ? '#b3d7fe'
                : checked === 'mixed'
                    ? 'goldenrod'
                    : 'transparent',
    }
}
