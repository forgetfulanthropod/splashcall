import { Settings } from '../../context'
import { ColorPickersSetting, SliderSetting, SpeedSliderSetting, CheckboxSetting } from '../../drawer/SettingInput'

export interface MonsterSettings {
    headRadius: number
    thickness: number
    tentacles: number
    color: string
    length: number
    pulse: boolean
}

const defaultColor0 = '#F5414C'
const defaultColor1 = '#ffed75'
const defaultBackgroundColor = '#9EE6FF'
export const defaultMonsterSettings: MonsterSettings = {
    headRadius: 30,
    thickness: 30,
    tentacles: 10,
    color: defaultColor0,
    length: 70,
    pulse: true,
}


export const defaultTentacleSettings: TentacleSettings = {
    sourceUrl: "https://github.com/soulwire/Muscular-Hydrostats",
    id: 'Tentacles',
    other: {
        darkTheme: true,
        m0: defaultMonsterSettings,
        m1: { ...defaultMonsterSettings, color: defaultColor1 },
    },
    drawer: {
        speed: { value: 0.3, type: 'SpeedSlider', range: [0.0, 1.0], step: 0.1 },
        gravity: { value: 0.2, type: 'Slider', range: [0, 3], step: 0.1, labels: ['gravity', null] },
        friction: { value: 0.02, type: 'Slider', range: [0, 1], step: 0.05, labels: ['friction', null] },
        wind: { value: 0.2, type: 'Slider', range: [-3, 3], step: 0.1, labels: ['wind', null] },
        tentacleCount: { value: 15, type: 'Slider', range: [1, 100], step: 1, labels: ['tentacles', null] },
        width: { type: 'Slider', value: 1200, labels: ['world size', null], range: [400, 2400], step: 200 },
        hasSlomoCollisions: { type: 'Checkbox', value: true, label: 'slomo collisions' },
        hasAutoMode: { type: 'Checkbox', value: true, label: 'auto mode' },
        hasJellyHead: { type: 'Checkbox', value: true, label: 'jelly head' },
        isGame: { type: 'Checkbox', value: false, label: 'game mode' },
        hasLotusEffect: { type: 'Checkbox', value: false, label: 'lotus' },
        colors: { type: 'ColorPickers', value: [defaultColor0, defaultColor1, defaultBackgroundColor] },
    },
    version: 20,
    disableNetworkTouchScaling: true,
}

export interface TentacleSettings extends Settings {
    other: {
        darkTheme: boolean
        m0: MonsterSettings
        m1: MonsterSettings
    }
    drawer: {
        speed: SpeedSliderSetting
        gravity: SliderSetting
        friction: SliderSetting
        wind: SliderSetting
        tentacleCount: SliderSetting
        hasSlomoCollisions: CheckboxSetting
        hasAutoMode: CheckboxSetting
        hasJellyHead: CheckboxSetting
        isGame: CheckboxSetting
        hasLotusEffect: CheckboxSetting
        colors: ColorPickersSetting
        width: SliderSetting
    }
}
