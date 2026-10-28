// Strings are safer to use as object keys

import { Settings, Touches } from './context'
import { defaultTentacleSettings } from "./cards/tentacles/settings"

export type CardId = (
    'Maze' |
    'FlatWaves' |
    'BouncyBalls' |
    'FluidSimulation' |
    'Doodle' |
    'FallingSand' |
    'Chess' |
    'Checkers' |
    'Snowflake' |
    'VoiceVisualizer' |
    'Tentacles' |
    'PhotoStack'
)

export const SETTINGS_VERSION = 3

export const allDefaultSettings: Record<CardId, Settings> = {
    Maze: {
        id: 'Maze',
        version: 1,
        drawer: {
            difficulty: { type: 'Slider', range: [0, 11], value: 3, labels: ['easy', 'difficult'] },
            avatarColors: {
                type: 'ColorPickers',
                value: [
                    '#ebadff',
                    '#7df59f',
                ]
            }
        },
        other: { isMutedWithoutOther: { value: true, type: 'bool' } }
    },
    FlatWaves: {
        id: 'FlatWaves',
        drawer: {
            speed: { type: 'SpeedSlider', range: [0, 11], value: 5 },
            colors: {
                type: 'ColorPickers',
                value: [
                    'rgb(255, 205, 112)',
                    'rgb(245, 66, 75)',
                    'rgb(255, 158, 158)',
                    'rgb(173, 252, 255)',
                    'rgb(235, 173, 255)',
                    'rgb(125, 245, 159)',
                    'rgb(222, 244, 145)',
                    'rgb(158, 170, 186)',
                    'rgb(158, 231, 255)',
                ]
            }
        }
    },
    BouncyBalls: {
        id: 'BouncyBalls',
        drawer: {
            ballDiameter: { type: 'Slider', range: [.6, 3.6], step: .1, value: 1.5, labels: ['small spheres', 'large spheres'] }
        }
    },
    FluidSimulation: { id: 'FluidSimulation', sourceUrl: 'https://paveldogreat.github.io/WebGL-Fluid-Simulation/' },
    Doodle: {
        other: { isMutedWithoutOther: { value: true, type: 'bool' } },
        id: 'Doodle',
        disableNetworkTouchScaling: true,
        preserveAspectRatio: true,
    },
    FallingSand: { id: 'FallingSand', sourceUrl: 'https://github.com/joshdon/ProjectSand' }, // NOTE: FallingSand settings are currently managed inside the scene
    Chess: {
        id: 'Chess',
        drawer: {
            colors: {
                type: 'ColorPickers',
                value: [
                    '#ffffff',
                    '#000000',
                ]
            }
        }
    },
    Checkers: {
        id: 'Checkers',
        drawer: {
            colors: {
                type: 'ColorPickers',
                value: [
                    '#ff0000',
                    '#000000',
                ]
            }
        }
    },
    Snowflake: {
        other: { isMutedWithoutOther: { value: true, type: 'bool' }, },
        drawer: {
            colors: {
                type: 'ColorPickers',
                value: [
                    '#fff',
                    '#fff',
                    '#74A7E0',
                ]
            },
        },
        id: 'Snowflake'
    },
    VoiceVisualizer: { id: 'VoiceVisualizer' },
    Tentacles: defaultTentacleSettings,
    PhotoStack: { id: 'PhotoStack' },
}

export type TouchAction =
    { type: 'receive', touches: Touches } |
    { type: 'send', touches: Touches }
