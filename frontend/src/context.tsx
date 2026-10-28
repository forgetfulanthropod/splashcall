import React, { useState, createContext, useEffect } from 'react'
import { allDefaultSettings, SETTINGS_VERSION, CardId, TouchAction } from './constants'
import { useEventEmitter, useLocalStorageState, useUpdateEffect } from 'ahooks'
import { useEffectWhen } from './hooks'
import merge from 'lodash/merge'
import { Setting } from './drawer/SettingInput'
import { nameToCard } from './CardManager'
import { logCallStart, logCallEnd, logCardSwitch } from './metrics'

type ConT = ReturnType<typeof useProviderValue>


const Con = createContext<ConT>(undefined)
export function useAppContext(): ConT {
    return React.useContext(Con)
}

export type Touch = {
    x: number
    y: number
    type?: 'down' | 'up' | 'move'
    index?: number
    uid?: string
    metadata?: unknown
    timestamp?: unknown
}
export type Touches = Touch[]

export type Setter<T> = React.Dispatch<React.SetStateAction<T>>

export interface Settings {
    id: CardId
    drawer?: Record<string, Setting>
    other?: Record<string, unknown>
    disableNetworkTouchScaling?: boolean
    preserveAspectRatio?: boolean
    version?: number
    sourceUrl?: string
}

type CallerType = 'guest' | 'host' | undefined

export type ResizerEvent = { type: "resize" } | { type: "setOther", other: number, resize: boolean } | { type: "setUsed", used: number }

export type Size = [number, number]
export type ScreenInfo = { width: number, height: number }
export interface Aspect {
    my: number
    other: number
    used: number
    screenInfo: ScreenInfo
    needsResize: boolean
}


function initialAspect(): Aspect {
    const screenInfo: ScreenInfo = { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight }
    const clip = (lower, x, upper) => Math.min(upper, Math.max(lower, x))
    const ratio = clip(6 / 13, screenInfo.width / screenInfo.height, 13 / 6)
    return { my: ratio, used: ratio, other: null, screenInfo, needsResize: false }
}


type Children = JSX.Element[] | JSX.Element
export function Provider({ children }: { children: Children }): JSX.Element {

    const value = useProviderValue()

    // useEventListener('beforeunload', function confirmExit(e: BeforeUnloadEvent) {
    //     if (value.isCallConnected) {
    //         const message = `Are you sure you want to end the call with ${value.otherName}?`
    //         e.returnValue = message
    //         return message
    //     }
    //     return null
    // })

    useMetrics(value)

    useEffectWhen(() => value.resizer$.emit({ type: "resize" }), [value.resizer$], [value.settings.id])

    if (value.hasBadSettings) { return <> </> }

    return <Con.Provider value={value}>
        {children}
    </Con.Provider>
}


function useProviderValue() {
    const [myName, setMyName] = useLocalStorageState<string>('myName', '')
    const [otherName, setOtherName] = useLocalStorageState('otherName', '')

    const [isMicMuted, setIsMicMuted] = useState(true)
    const [voiceVolume, setVoiceVolume] = useLocalStorageState('voiceVolume', 6)
    const [feedbackVolume, setFeedbackVolume] = useLocalStorageState('feedbackVolume', 3)
    const [isCallConnected, setIsCallConnected] = useState<boolean>(false)
    const touch$ = useEventEmitter<TouchAction>()

    const [myAudioStream, setMyAudioStream] = useState<MediaStream>(null)
    const [theirAudioStream, setTheirAudioStream] = useState<MediaStream>(null)

    const [callerType, setCallerType] = useState<CallerType>()
    const [aspect, setAspect] = useState(initialAspect)
    const reload$ = useEventEmitter<{ fromClick?: boolean }>()
    const resizer$ = useEventEmitter<ResizerEvent>()

    const { allSettings, settings, setSettings, hasBadSettings } = useSettings()

    return {
        allSettings,
        myName, setMyName,
        otherName, setOtherName,

        isMicMuted, setIsMicMuted,

        voiceVolume, setVoiceVolume,
        feedbackVolume, setFeedbackVolume,
        isCallConnected, setIsCallConnected,

        settings, setSettings, hasBadSettings,

        myAudioStream, setMyAudioStream,
        theirAudioStream, setTheirAudioStream,

        callerType, setCallerType,
        aspect, setAspect,
        reload$, resizer$, touch$,
    }
}

function useSettings() {
    const [settingsVersion, setSettingsVersion] = useLocalStorageState<number>('settingsVersion')
    const [allSettings, setAllSettings] = useLocalStorageState('allSettings', allDefaultSettings)
    const [settings, setSettings] = useLocalStorageState('settings', allSettings.Tentacles)

    const hasOldSettings = settingsVersion == null || settingsVersion < SETTINGS_VERSION
    if (hasOldSettings) {
        setAllSettings(allDefaultSettings)
        setSettings(allDefaultSettings.Tentacles)
        setSettingsVersion(SETTINGS_VERSION)
    }

    const hasUnknownTexture = !(settings.id in nameToCard)
    if (hasUnknownTexture && !hasOldSettings) {
        setSettings(allSettings.Tentacles)
    }

    const hasOldCardSettings = !hasUnknownTexture && settings.version !== allDefaultSettings[settings.id].version
    if (!hasUnknownTexture && hasOldCardSettings) {
        setSettings(allDefaultSettings[settings.id])
    }
    const hasBadSettings = hasOldSettings || hasUnknownTexture || hasOldCardSettings

    //merge new default settings keys, but prefer those from storage
    useEffect(() => {
        if (hasBadSettings) { return }
        setAllSettings(merge({}, allDefaultSettings, allSettings))
        setSettings(merge({}, allDefaultSettings[settings.id], settings))
        // eslint-disable-next-line
    }, [])

    useEffectWhen(() => {
        if (hasBadSettings) { return }
        setAllSettings(allSettings => ({ ...allSettings, [settings.id]: settings }))
    }, [hasBadSettings, setAllSettings, settings], [settings])

    return { allSettings, settings, setSettings, hasBadSettings }
}


function useMetrics(value: ConT) {
    const [startedLogging, setStartedLogging] = useState(false)
    useUpdateEffect(() => {
        const shouldStartLogging = value.callerType == 'host' && value.isCallConnected
        setStartedLogging(shouldStartLogging)
        if (shouldStartLogging) {
            logCallStart({
                cardName: value.settings.id,
                usernames: [
                    value.myName,
                    value.otherName,
                ],
                host: value.myName,
                guest: value.otherName,
            })
        } else if (startedLogging) {
            logCallEnd()
        }
    }, [value.callerType, value.isCallConnected])

    useUpdateEffect(() => {
        if (startedLogging)
            logCardSwitch(value.settings.id)
    }, [value.settings.id])
}
