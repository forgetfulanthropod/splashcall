import React from 'react'
import styled from 'styled-components'

import ColorPicker from './ColorPicker'
import Slider from './Slider'
import Checkbox from './Checkbox'

import TurtleSvg from 'assets/icons/turtle.svg'
import RabbitSvg from 'assets/icons/rabbit.svg'

const Turtle = styled.img`
    width: 55px;
`

const Rabbit = styled.img`
    width: 32px;
    margin-left: 8px;
`

const SliderTextLabel = styled.label`
    line-height: 30px;
    margin: 0 3px;
`

const Root = styled.div`
    color: #A0A0A0;
`

export type Setting = SpeedSliderSetting | SliderSetting | ColorPickersSetting | CheckboxSetting

export type SpeedSliderSetting = { type: 'SpeedSlider', range: [number, number], value: number, step?: number }
export type SliderSetting = { type: 'Slider', range: [number, number], labels: [string, string], hasHandleLabel?: boolean, step?: number, value: number }
export type ColorPickersSetting = { type: 'ColorPickers', value: string[] }
export type CheckboxSetting = { type: 'Checkbox', label: string, value: boolean, }

export default function SettingInput({ settingKey, setting, setSetting }: { settingKey: string, setting: Setting, setSetting: (a: string, b) => void }): JSX.Element {

    return <Root style={{ display: setting.type == 'Checkbox' ? 'inline-block' : 'inherit' }}>
        {setting.type === 'SpeedSlider' && <div style={{ display: 'flex' }}>
            <Turtle src={TurtleSvg} />
            <Slider
                min={setting.range[0]}
                max={setting.range[1]}
                step={setting.step ?? 1}
                value={setting.value}
                onChange={value => setSetting(settingKey, value)}
                style={{ display: 'inline-block', flexGrow: 1, alignSelf: 'center', margin: '0 12px' }}
            />
            <Rabbit src={RabbitSvg} />
        </div>}
        {setting.type === 'Slider' && <div style={{ display: 'flex' }}>
            <SliderTextLabel>{setting.labels[0]}</SliderTextLabel>
            <Slider
                min={setting.range[0]}
                max={setting.range[1]}
                hasHandleLabel={setting.hasHandleLabel}
                step={setting.step ?? 1}
                value={setting.value}
                onChange={value => setSetting(settingKey, value)}
                style={{ display: 'inline-block', flexGrow: 1, alignSelf: 'center', margin: '0 12px' }}
            />
            <SliderTextLabel>{setting.labels[1]}</SliderTextLabel>
        </div>}
        {setting.type === 'ColorPickers' && <div style={{ overflowX: 'auto', padding: '20px 0' }}>
            <div style={{ textAlign: 'right', paddingBottom: '12px', whiteSpace: 'nowrap' }}>
                {setting.value.map((color, i) =>
                    <ColorPicker
                        key={i}
                        makeSpaceWhenOpen
                        style={{ paddingLeft: '4px', display: 'inline-block' }}
                        {...{
                            color,
                            setColor(c) { setSetting(settingKey, [...setting.value.slice(0, i), c, ...setting.value.slice(i + 1)]) },
                        }}
                    />)}
            </div>
        </div>
        }
        {setting.type === 'Checkbox' && <div style={{ margin: '12px 0 0 20px' }}>
            <label style={{ display: "flex", alignItems: "center", justifyContent: 'flex-end' }}>
                {setting.label}
                <Checkbox checked={setting.value} onChange={e => setSetting(settingKey, e.target.checked)} style={{ marginLeft: '6px', marginRight: '0px' }} />
            </label>
        </div>
        }
    </Root>
}
