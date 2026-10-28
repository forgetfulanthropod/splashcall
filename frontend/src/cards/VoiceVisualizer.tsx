import React, { useEffect } from 'react'

import { useAppContext } from '../context'
import { getUserMedia } from '../connection/AudioManager'
import { useScene } from '../hooks'
import { SceneApi } from '../textureUtils'
// import styled from 'styled-components'

interface VoiceSceneApi extends SceneApi {
    setMyStream: (a) => void
    setTheirStream: (a) => void
}

export default function VoiceVisualizer(): JSX.Element {
    const {
        myAudioStream,
        theirAudioStream
    } = useAppContext()

    const [onRef, scene] = useScene(createScene)
    useEffect(() => {
        if (scene == null || myAudioStream == null) return

        scene.setMyStream(myAudioStream)

    }, [scene, myAudioStream])
    useEffect(() => {
        if (scene == null || theirAudioStream == null) return

        scene.setTheirStream(theirAudioStream)

    }, [scene, theirAudioStream])

    return <>
        {myAudioStream == null &&
            <button
                style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%,-50%)',
                    height: '84px',
                    width: '84px',
                    borderRadius: '50%',
                    border: '1px solid gray',
                    background: '#ccffcc',
                    color: 'gray',
                    fontWeight: 'bold',
                }}
                onClick={() => getUserMedia()}
            >
                enable mic
            </button>
        }
        <canvas ref={onRef} style={{ width: '100%', height: '100%' }} />
    </>
}

function getAnalyserFromStream(stream) {

    const myAudioCtx = new AudioContext()

    const source = myAudioCtx.createMediaStreamSource(stream)

    //debug begin
    // const osc1 = myAudioCtx.createOscillator()

    // osc1.type = 'sine'
    // osc1.frequency.value = 100 //test f
    // osc1.start()


    // const osc2 = myAudioCtx.createOscillator()

    // osc2.type = 'sine'
    // osc2.frequency.value = 3000 //test f
    // osc2.start()

    // const merger = myAudioCtx.createChannelMerger(2)
    // osc1.connect(merger, 0, 0)
    // osc2.connect(merger, 0, 0)

    // const source = myAudioCtx.createGain()
    // source.gain.value = .1
    // merger.connect(source)
    // debug end

    const analyser = myAudioCtx.createAnalyser()

    analyser.minDecibels = -90
    analyser.maxDecibels = -10

    source.connect(analyser)

    const gainNode = myAudioCtx.createGain()
    gainNode.gain.value = 0
    analyser.connect(gainNode)

    gainNode.connect(myAudioCtx.destination)

    return analyser
}

function createScene(canvas, { width: WIDTH, height: HEIGHT }): VoiceSceneApi {

    canvas.width = WIDTH
    canvas.height = HEIGHT


    const ctx = canvas.getContext('2d')

    let animationId = requestAnimationFrame(() => null)

    const drawCallbacks = []
    function draw() {
        drawDeadSpaces()

        drawCallbacks.forEach(cb => cb())

        animationId = requestAnimationFrame(draw)
    }

    function getDrawWaveformCallback({ top, bottom, analyser }) {

        analyser.smoothingTimeConstant = 0.85
        analyser.fftSize = 2048
        const bufferLength = analyser.fftSize
        const dataArray = new Uint8Array(bufferLength)

        return () => {

            // ctx.fillStyle = 'black'
            ctx.fillStyle = '#A278D6'
            ctx.fillRect(0, top, WIDTH, bottom - top)

            analyser.getByteTimeDomainData(dataArray)

            ctx.lineWidth = 2
            ctx.strokeStyle = 'white'

            ctx.beginPath()

            const sliceWidth = WIDTH * 1.0 / bufferLength
            let x = 0

            for (let i = 0; i < bufferLength; i++) {

                const v = dataArray[i] / 128
                const y = (v - 1) * (bottom - top) + (bottom + top) / 2

                if (i === 0) {
                    ctx.moveTo(x, y)
                } else {
                    ctx.lineTo(x, y)
                }

                x += sliceWidth
            }

            ctx.stroke()
        }

    }

    function getDrawFrequenciesCallback({ top, bottom, analyser }) {

        analyser.fftSize = 256

        // const CUT_HIGH_FREQ_BUFFER_RATIO = 1 / 25
        const CUT_HIGH_FREQ_BUFFER_RATIO = 1

        const bufferLengthAlt = analyser.frequencyBinCount * CUT_HIGH_FREQ_BUFFER_RATIO
        console.log(bufferLengthAlt)
        const dataArrayAlt = new Uint8Array(bufferLengthAlt)

        return () => {
            // ctx.fillStyle = '#FFCD70'
            ctx.fillStyle = '#666'
            ctx.fillRect(0, top, WIDTH, bottom - top)

            analyser.getByteFrequencyData(dataArrayAlt)

            const barWidth = (WIDTH / bufferLengthAlt) * 2.5

            let x = 0
            const LOW_FREQ_BUFFER_INDEX = 0

            for (let i = LOW_FREQ_BUFFER_INDEX; i < bufferLengthAlt; i++) {
                const barHeight = dataArrayAlt[i] * 2

                // ctx.fillStyle = `rgb(180,180,${barHeight + 200})`
                ctx.fillStyle = `rgb(255,200,${barHeight + 70})`
                ctx.fillRect(x, bottom - barHeight / 2, barWidth, barHeight / 2)

                x += barWidth + 1
            }
        }
    }

    function drawDeadSpaces() {
        ctx.fillStyle = '#A278D6'
        ctx.fillRect(0, 0, WIDTH, HEIGHT)
        ctx.font = '10px monospace'
        ctx.fillStyle = 'white'
        const textHeight = HEIGHT / 2 + 5
        ctx.fillText('100Hz', 5, textHeight)
        ctx.fillText('3kHz', WIDTH / 2 - 40, textHeight)
        ctx.fillText('6kHz', WIDTH - 30, textHeight)
    }

    function restartAnimation() {
        cancelAnimationFrame(animationId)
        animationId = requestAnimationFrame(draw)
    }


    return {
        setOtherTouches: (ots) => void ots,
        onTouches: (cb) => void cb,
        stopTime: () => null,
        setMyStream(stream) {

            drawCallbacks.push(
                getDrawWaveformCallback({ top: canvas.height * .65, bottom: canvas.height * .9, analyser: getAnalyserFromStream(stream) })
            )

            drawCallbacks.push(
                getDrawFrequenciesCallback({ top: canvas.height * .5 + 10, bottom: canvas.height * .65, analyser: getAnalyserFromStream(stream) })
            )

            restartAnimation()
        },
        setTheirStream(stream) {

            drawCallbacks.push(
                getDrawWaveformCallback({ top: canvas.height * .1, bottom: canvas.height * .35, analyser: getAnalyserFromStream(stream) })
            )

            drawCallbacks.push(
                getDrawFrequenciesCallback({ top: canvas.height * .35, bottom: canvas.height * .5 - 10, analyser: getAnalyserFromStream(stream) })
            )

            restartAnimation()
        },
    }
}
