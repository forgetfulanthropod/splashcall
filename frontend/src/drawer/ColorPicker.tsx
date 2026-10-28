import React, { useRef, useState } from 'react'
import { HexColorPicker } from 'react-colorful'
import styled from 'styled-components'
import { useClickAway, useLocalStorageState } from 'ahooks'
import { useEffectWhen } from '../hooks'
import { useEffect } from 'react'


const RainbowButton = styled.button`
width: 50px;
height: 50px;
border: none;
border-radius: 100%;

background:
    linear-gradient(cyan, rgba(255,255,255,.8)),
    linear-gradient(-45deg, magenta, rgba(255,255,255,.8)),
    linear-gradient(45deg, yellow, rgba(255,255,255,.8));
background-blend-mode: multiply;
transform: rotate(6deg);
transform-origin: 50%;
`

const Wrap = styled.div<{ direction: string }>`
position: absolute;
z-index: 100;
bottom: 0;
left: 0;
${p => p.direction.indexOf('left') != -1 ? 'left: initial; right: 60px;' : ''}
${p => p.direction.indexOf('right') != -1 ? 'left: 60px;' : ''}
${p => p.direction.indexOf('up') != -1 ? 'bottom: 20px;' : ''}
${p => p.direction.indexOf('down') != -1 ? 'top: 20px;' : ''}
`


export default function ColorPicker({ color, setColor, direction, style, makeSpaceWhenOpen }: { color: string, setColor: (c) => void, direction?: string, style?, makeSpaceWhenOpen?: boolean }): JSX.Element {

    const [isOpen, setIsOpen] = useState<boolean>(false)
    const [computedDirection, setComputedDirection] = useState<string | undefined>(direction)
    const root = useRef(null)

    useClickAway(() => setIsOpen(false), root)


    useEffect(() => {
        if (root?.current == null) return

        if (direction == null) {
            const rect = root.current.getBoundingClientRect()
            const computedDirection = rect.x < window.innerWidth / 2 ? 'right' : 'left'
            setComputedDirection(computedDirection)
        }
    }, [root, direction])

    const wrapStyles = {
        position: 'relative',
        transition: isOpen ? '.3s' : '.6s',
        ...style,
        paddingTop: isOpen && makeSpaceWhenOpen ? '240px' : '',
        paddingLeft: isOpen && makeSpaceWhenOpen && computedDirection.indexOf('left') > -1 ? '220px' : '4px',
        paddingRight: isOpen && makeSpaceWhenOpen && computedDirection.indexOf('right') > -1 ? '220px' : '4px',
    }


    return <div style={wrapStyles} ref={root}>
        <RainbowButton onClick={() => setTimeout(() => setIsOpen(is => !is), isOpen ? 0 : 10)}>
            <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: color, position: 'relative', left: '-5px', top: '-13px', }} />
        </RainbowButton>
        {
            isOpen &&
            <Picker {...{ color, setColor, direction: computedDirection, }} />
        }
    </div >
}

function Picker({ color, setColor, direction }: { color, setColor, direction }): JSX.Element {
    const [rememberedColors, setRememberedColors] = useLocalStorageState('rememberedColors', [])

    useEffectWhen(() => {
        // add color to pallette on unmount
        return () => {
            let updatedColors = [color, ...rememberedColors]

            // all colors unique
            updatedColors = updatedColors.filter((v, i) => updatedColors.indexOf(v) === i)

            if (updatedColors.length > 12)
                updatedColors.splice(12)

            setRememberedColors(updatedColors)
        }
    }, [color, rememberedColors, setRememberedColors], [])

    return <Wrap {...{ direction }}>
        <HexColorPicker color={toHex(color)} onChange={c => { setColor(c) }} />
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid gray', width: '200px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            {rememberedColors.map(background =>
                <div
                    key={background}
                    style={{ background, width: '25px', height: '25px', borderRadius: '50%', display: 'inline-block', margin: '4px', cursor: 'pointer' }}
                    onClick={() => setColor(background)}
                ></div>
            )}
        </div>
    </Wrap>
}

function toHex(color: string) {
    if (color.indexOf('rgb') !== 0) return color

    const [r, g, b] = color.match(/[0-9]+/g).map(v => parseInt(v))
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)
}
