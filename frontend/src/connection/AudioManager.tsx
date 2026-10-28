/** Manage audio input & output streams and its volume slider */

import React, { useEffect, useState } from 'react'
import { useAppContext, Setter } from '../context'
import { onRemoteStream } from '../connection/peerConnection'
import { toast } from "react-hot-toast"
import { useUpdateEffect } from 'ahooks'

const isDuckDuckGo = ~navigator.userAgent.indexOf('DuckDuckGo')


let localStream: MediaStream
let _setMyAudioStream: Setter<MediaStream>
let _setIsMicMuted: Setter<boolean>
export async function getUserMedia(): Promise<MediaStream> {
    if (navigator?.mediaDevices?.getUserMedia == null) { return new MediaStream() }
    if (localStream != null) { return localStream }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        localStream = stream
        _setMyAudioStream(stream)
        _setIsMicMuted(false)
        return stream
    } catch (err) {
        console.log(err)
        _setIsMicMuted(true)
        return new MediaStream() // send other person an empty stream
    }
}

export function relinquishUserMedia(): void {
    if (localStream == null) return
    localStream.getTracks().forEach(t => t.stop())
    localStream = null
    _setMyAudioStream(null)
    _setIsMicMuted(true)
}

const KILL_THE_MIC_WAIT_TIME = 1000 * 60

// Returns empty JSX but keeping it as a component, instead of turning it into a `useX` hook, should reduce re-renders in the parent a bit
export default function AudioManager(): JSX.Element {
    const [amplifier, setAmplifier] = useState<Amplifier>()
    const { setIsMicMuted, isMicMuted, voiceVolume, setMyAudioStream, setTheirAudioStream, isCallConnected } = useAppContext()

    _setMyAudioStream = setMyAudioStream
    _setIsMicMuted = setIsMicMuted

    useUpdateEffect(function relinquishLater() {
        if (!isCallConnected) {
            const timeoutId = setTimeout(relinquishUserMedia, KILL_THE_MIC_WAIT_TIME)
            return () => clearTimeout(timeoutId) // cleanup triggered when isCallConnected changes
        }
        return () => { }
    },
        [isCallConnected])

    onRemoteStream(stream => {
        setTheirAudioStream(stream)
        const newAmplifier = makeAmplifier(stream)
        setAmplifier(newAmplifier)
        return function cleanup() {
            setTheirAudioStream(null)
            newAmplifier.destroy()
            setAmplifier(null)
        }
    })

    useEffect(() => {
        if (isDuckDuckGo) {
            toast('We like DuckDuckGo just as much as you, but it doesn\'t allow the mic.\nIf you want to do a call, please switch to another browser.')
            setIsMicMuted(true)
        }
    }, [setIsMicMuted])


    useEffect(() => {
        amplifier?.setVolume(voiceVolume / 5)
        if (amplifier != null && voiceVolume === 0) {
            toast("you have the other person muted", { icon: '🔇' })
        }
    }, [voiceVolume, amplifier])

    useEffect(() => {
        if (localStream == null) return
        localStream.getTracks().forEach(track => track.enabled = !isMicMuted)
    }, [isMicMuted])

    return <></>
}

interface Amplifier {
    setVolume: (n: number) => void
    destroy: () => void
}

function makeAmplifier(stream: MediaStream): Amplifier {
    // Bug in browsers requires us to attach the stream to an audio element in order to hold on to it.
    // https://stackoverflow.com/a/54781147/4941530
    let elm = new Audio()
    elm.srcObject = stream
    elm.volume = 0

    let ctx = new AudioContext()
    let source = ctx.createMediaStreamSource(stream)
    let gainNode = ctx.createGain()

    // A gain node allows us to put the volume over 100%. (Knob up to 11.)
    // Will also allow modulation.
    gainNode.gain.value = 1
    source.connect(gainNode)
    gainNode.connect(ctx.destination)

    function destroy() {
        // VERY DELICATE
        gainNode?.disconnect()
        ctx?.close()
        // calling removeAttribute may be more reliable than setting srcObject to null:
        // https://stackoverflow.com/q/3258587/4941530
        elm?.removeAttribute('srcObject')
        elm?.remove()
        source?.disconnect()
        stream = elm = ctx = source = gainNode = null
    }

    function setVolume(v) {
        gainNode.gain.value = v
    }

    return Object.freeze({ setVolume, destroy })
}
