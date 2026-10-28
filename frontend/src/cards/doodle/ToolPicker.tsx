import React, { useRef, useState } from 'react'
import styled from 'styled-components'
import { useClickAway } from 'ahooks'
import Slider from '../../drawer/Slider'

import BucketSvg from 'assets/icons/bucket.svg'
import EraserSvg from 'assets/icons/eraser.svg'
import BrushSvg from 'assets/icons/brush.svg'

const RoundButton = styled.button<{ isSelected?: boolean }>`
    border: 1px solid lightgray;
    box-shadow: none;
    ${p => p.isSelected && 'box-shadow: 0px 0px 0px 3px #666;'}
    border-radius: 100%;
    width: 50px;
    height: 50px;
    margin-bottom: 3px;
    background: #f4f4f4;
    &::focus-visible {
        outline: none;
    }
    & > img {
        width: 35px;
    }
`

const Wrap = styled.div<{ direction: string }>`
display: flex;
align-items: flex-end;
position: absolute;
bottom: 0;
right: 60px;
`


export default function ToolPicker(
    { tool, setToolSize, setToolId, color, direction, canvasToDisplayPixelRatio }:
        { tool: { name, color?, size?}, setToolSize: (s) => void, setToolId: (id) => void, color?, direction: string, canvasToDisplayPixelRatio }
): JSX.Element {

    const [isOpen, setIsOpen] = useState<boolean>(false)
    const root = useRef()

    useClickAway(() => setIsOpen(false), root)

    const toolsUIMeta = [
        { name: 'bucket' },
        { name: 'eraser', fixedHandleColor: 'white', hasSlider: true, },
        { name: 'brush', hasSlider: true, }
    ]

    const nameToSvg = {
        bucket: BucketSvg,
        eraser: EraserSvg,
        brush: BrushSvg,
    }

    const maxBrushSize = 200
    const handleGrowRange: [number, number] = [1, maxBrushSize * 2 * canvasToDisplayPixelRatio]

    return <div style={{ position: 'relative' }} ref={root}>
        <RoundButton onClick={() => setIsOpen(is => !is)} >
            <img src={nameToSvg[tool.name]} />
        </RoundButton>
        {
            isOpen &&
            <Wrap {...{ direction }}>
                {toolsUIMeta.map((t, i) => {
                    const isSelected = t.name === tool.name
                    return <div key={i}>
                        <div style={{ position: 'relative', left: '20px', bottom: '14px' }}>
                            {isSelected && t.hasSlider && <Slider
                                min={1}
                                max={maxBrushSize}
                                value={tool.size}
                                vertical
                                handleColor={t.fixedHandleColor || color}
                                handleGrowRange={handleGrowRange}
                                onChange={s => setToolSize(s)}
                            />}
                        </div>
                        <RoundButton
                            {...{ isSelected }}
                            onClick={() => setToolId(t.name)}
                            style={{ marginRight: '6px' }}
                        >
                            <img src={nameToSvg[t.name]} />
                        </RoundButton>
                    </div>
                })}
            </Wrap>
        }
    </div >
}
