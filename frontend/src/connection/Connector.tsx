import { useDebounceEffect } from 'ahooks'
import React, { useEffect, useState } from 'react'
import styled from 'styled-components'

import { useAppContext, Settings, Touches } from '../context'
import { noSelect } from '../css-snippets.json'
import { useEffectWhen } from '../hooks'
import UserContext from '../user/UserContext'
import UserManager from '../user/UserManager'
import AudioManager from './AudioManager'
import ConnectMenuManager from './ConnectMenuManager'
import { emitDataEvent, onDataEvent } from './dataConn'
import { doCall, setupPeer, shareState } from './peerConnection'
import Status from './Status'

const Root = styled.div`
  ${noSelect}
  pointer-events: none;
  position: absolute;
  z-index: 100;
  padding: 15px;
  left: 0;
  right: 0;
  text-align: right;
`


export default function Connector(): JSX.Element {
    const { myName, otherName, setOtherName } = useAppContext()
    const [justReceivedSettings, setJustReceivedSettings] = useState<boolean>(false)
    const [isPeerReady, setIsPeerReady] = useState(false)

    const {
        settings, setSettings,
        callerType, setCallerType,
        isCallConnected, setIsCallConnected,
        aspect,
        resizer$,
        touch$
    } = useAppContext()

    useEffect(() => {
        shareState({ setCallerType, otherName, setOtherName, setIsCallConnected, setIsPeerReady })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [otherName])

    useEffect(() => setupPeer(myName), [myName])

    // Sync settings and touches
    {
        onDataEvent('settings', settings => {
            setJustReceivedSettings(true)
            setSettings(settings as Settings)
        })
        onDataEvent('aspectRatio', (data: { screen: number, used: number }) => {
            if (aspect.other == null && callerType === 'guest' && settings.preserveAspectRatio as boolean) {
                resizer$.emit({ type: "setUsed", used: data.used })
            } else {
                resizer$.emit({ type: "setOther", other: data.screen, resize: !settings.preserveAspectRatio })
            }
        })
        useDebounceEffect(function sendAspectRatio() {
            if (isCallConnected) {
                emitDataEvent('aspectRatio', { screen: aspect.my, used: aspect.used })
            }
        }, [isCallConnected, aspect.my])

        onDataEvent('sendTouches', (touches: Touches) => {
            if (aspect.screenInfo == null) { return }
            if (settings.disableNetworkTouchScaling === true) {
                touch$.emit({ type: 'receive', touches: touches })
                return
            }
            const scaledUpTouches = touches.map(t => ({ ...t, x: Math.floor(t.x * aspect.screenInfo.width), y: Math.floor(t.y * aspect.screenInfo.height) }))
            touch$.emit({ type: 'receive', touches: scaledUpTouches })
        })

        useEffectWhen(function sendChangedSettings() {
            if (justReceivedSettings) {
                setJustReceivedSettings(false)
                return
            }
            emitDataEvent('settings', settings)
        },
            [justReceivedSettings, settings],
            [settings])

        useEffectWhen(function sendNewGuestSettings() {
            if (callerType == 'host' && isCallConnected) {
                emitDataEvent('settings', settings)
            }
        },
            [callerType, isCallConnected, settings],
            [callerType, isCallConnected])

        touch$.useSubscription(({ type, touches }) => {
            if (type === 'receive') { return }
            if (touches == null || aspect.screenInfo == null) return
            if (settings.disableNetworkTouchScaling === true) {
                emitDataEvent('sendTouches', touches)
                return
            }
            const scaledDownTouches = touches.map(t => ({ ...t, x: t.x / aspect.screenInfo.width, y: t.y / aspect.screenInfo.height }))
            emitDataEvent('sendTouches', scaledDownTouches)
        })
    }
    useEffectWhen(function readAndUpdateUrlCode() {
        if (document?.location?.search == null) { return }
        const name = location.pathname.replace('/', '')
        if (name && name.length > 1 && name !== myName) {
            setOtherName(name)
        }
        console.log(window.location.pathname)
        window.history.replaceState({}, document.title, myName)
    }, [myName, setOtherName], [])
    useEffect(() => window.history.replaceState({}, document.title, myName.length > 0 ? myName : '/'), [myName])

    useEffectWhen(function initialCall() {
        if (!isPeerReady) { return }
        doCall(otherName)
    }, [isPeerReady, otherName], [isPeerReady])

    return <Root>
        <Status />
        <UserContext>
            <UserManager />
            <ConnectMenuManager callerType={callerType} otherName={otherName} setOtherName={setOtherName} />
        </UserContext>
        <AudioManager />
    </Root>
}
