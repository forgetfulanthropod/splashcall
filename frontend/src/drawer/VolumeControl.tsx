import React, { useRef, useState } from 'react'
import { useClickAway } from 'ahooks'
import { useAppContext } from '../context'
import Slider from './Slider'

import MutedSvg from 'assets/icons/sound is muted.svg'
import UnmutedSvg from 'assets/icons/sound is on.svg'
import VoiceSvg from "assets/icons/voice.svg"
import SoundSvg from "assets/icons/sound effects.svg"

export default function Controls(): JSX.Element {
    const {
        voiceVolume, setVoiceVolume,
        feedbackVolume, setFeedbackVolume,
    } = useAppContext()

    const [isMenuOpen, setIsMenuOpen] = useState(false)

    const root = useRef(null)
    useClickAway(() => setIsMenuOpen(false), root)

    const volumeIcon = (!voiceVolume && !feedbackVolume) ? MutedSvg : UnmutedSvg

    return <div id="VolumeControl" style={{ display: 'inline-block' }} ref={root} >
        {
            isMenuOpen && <div style={{ background: 'white', border: '1px solid gray', borderRadius: '3px', bottom: '40px', left: '40px', position: 'absolute', width: '220px', zIndex: 100, boxShadow: '0 0 0 3px white' }}>
                <div style={{ display: 'flex', margin: '20px' }}>
                    <img src={VoiceSvg} style={{ width: '20px', marginRight: '16px' }} />
                    <Slider min={0} max={11} value={voiceVolume} onChange={value => setVoiceVolume(value)} style={{ width: '100%' }} />
                </div>
                <div style={{ display: 'flex', margin: '20px' }}>
                    <img src={SoundSvg} style={{ width: '20px', marginRight: '16px', position: 'relative', left: '-4px' }} />
                    <Slider min={0} max={11} value={feedbackVolume} onChange={value => setFeedbackVolume(value)} style={{ width: '100%' }} />
                </div>
            </div>
        }
        <img onClick={() => setIsMenuOpen(!isMenuOpen)} src={volumeIcon} style={{ width: '20px', display: 'inline-block', height: '20px', }} />
    </div >
}
