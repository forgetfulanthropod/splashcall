/** UI & logic for touch sounds and its volume slider */

import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import React, { useCallback, useRef, useState } from 'react'
import { useAppContext, Touch, Touches } from '../context'

// import { Haptics, ImpactStyle } from '@capacitor/haptics'
// import { Capacitor } from "@capacitor/core"

interface AudioTools {
    audioCtx: AudioContext
    oscillator: OscillatorNode
    gainNode: GainNode
}

const DEFAULT_VOLUME = .25
const FREQ_MAX = 500
const FREQ_MIN = 80
const MAX_DIST = 800
const MIN_DIST = 0

function mute(audioTools) {
    if (audioTools == null) return
    audioTools.gainNode.gain.setTargetAtTime(0, audioTools.audioCtx.currentTime, .01)
}

function putVolumeOnNode(audioTools, feedbackVolume) {
    if (audioTools == null) return
    audioTools.gainNode.gain.setTargetAtTime(DEFAULT_VOLUME * feedbackVolume / 5, audioTools.audioCtx.currentTime, .01)
}

function createAudioTools() { // must initialize on user action

    const audioCtx = new AudioContext()
    // console.log('initializing audio context')

    const oscillator = audioCtx.createOscillator()

    oscillator.type = 'sine'
    oscillator.frequency.value = 80

    const gainNode = audioCtx.createGain()
    gainNode.gain.value = DEFAULT_VOLUME

    oscillator.connect(gainNode)
    oscillator.start()

    gainNode.connect(audioCtx.destination)

    return { audioCtx, oscillator, gainNode }
}


export default function AudioFeedback(): JSX.Element {
    const { touch$, feedbackVolume, settings } = useAppContext()
    const [audioTools, setAudioTools] = useState<AudioTools | undefined>()
    const touchesRef = useRef(null)
    const otherTouchesRef = useRef(null)

    // useEffect(() => putVolumeOnNode(audioTools, feedbackVolume), [audioTools, feedbackVolume]) // TODO: needed?

    const updateSounds = useCallback(function (touches: Touches, otherTouches: Touches) {
        if (touches?.[0] == null) return
        if (otherTouches?.[0] == null) return
        if (audioTools == null) {
            setAudioTools(createAudioTools())
            return
        }
        // if any of them are up touches, then we will mute and return
        const hasUpTouch = touches.some(t => t.type === 'up') || (touches[0].x < 0)
        if (hasUpTouch || settings?.other?.isMutedWithoutOther?.['value'] === true) {
            // console.log('muting')
            mute(audioTools)
            return
        }
        // console.log('call after mute..')
        updateFrequency(touches[0], otherTouches[0], audioTools)
        putVolumeOnNode(audioTools, feedbackVolume)
    }, [audioTools, settings, feedbackVolume])

    touch$.useSubscription(({ type, touches: ts }) => {
        // console.log({ type, ts })
        if (type == 'send') {
            // console.log(ts[0])
            touchesRef.current = ts

            if (otherTouchesRef.current == null) otherTouchesRef.current = [{ x: -1, y: -1 }]

            updateSounds(touchesRef.current, otherTouchesRef.current)
        }
        if (type == 'receive') {
            otherTouchesRef.current = ts
            updateSounds(touchesRef.current, otherTouchesRef.current)
        }
    }
    )

    return <div></div>
}

function updateFrequency(touch: Touch, otherTouch: Touch, audioTools: AudioTools): void {
    const distance = Math.sqrt((otherTouch.x - touch.x) ** 2 + (otherTouch.y - touch.y) ** 2)
    maybeVibrate(distance)
    const limitedDist = Math.min(Math.max(distance, MIN_DIST), MAX_DIST)
    audioTools.oscillator.frequency.value = Math.max(FREQ_MIN, FREQ_MAX - FREQ_MAX * limitedDist / MAX_DIST)
}

function maybeVibrate(distance) {
    // TODO: navigator.vibrate call seems to do nothing
    switch (Capacitor.getPlatform()) {
        case 'web':
            // eslint-disable-next-line
            if (window.navigator.vibrate) {
                window.navigator.vibrate(distance < 25 ? 10000 : 0)
            }
            break
        case 'android': // fall through
        case 'ios':
            if (distance < 25) { Haptics.impact({ style: ImpactStyle.Medium }) }
            break
    }
}
