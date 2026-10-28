/** Hides & shows connects menu and makes hands green */

import React, { useState, useEffect, useRef } from 'react'
import styled from 'styled-components'
import { useAppContext, Setter } from '../context'

import ConnectMenu from './ConnectMenu'

import { noSelect } from '../css-snippets.json'
import { useClickAway } from 'ahooks'

import HandsGreen1Svg from 'assets/icons/hands green 1.svg'
import Hand2Svg from 'assets/icons/hand 2.svg'
import XCircleSvg from 'assets/icons/x-circle.svg'

const ConnectButton = styled.a<{ isCallConnected: boolean, small?: boolean, onClick: (_) => void }>`
  ${noSelect}
  pointer-events: initial;
  padding: 10px;
  border-radius: 0 20px 0 20px;
  border: ${p => (p.small || p.isCallConnected) ? 'none' : '1px solid gray'};
  background: ${p => (p.small || p.isCallConnected) ? 'none' : 'rgba(255,255,255,.8)'};
  display: inline-block;
  cursor: ${p => p.isCallConnected ? 'inherit' : 'pointer'};
  & > * {
    width: ${p => p.small ? '35px' : '40px'};
    ${p => p.isCallConnected ? 'width: 80px;' : ''};
  }
`
const OtherName = styled.div`
  font-size: 18px;
  color: #a0a0a0;
  border-radius: 22px;
  border: 1px solid #666;
  display: inline-block;
  padding: 4px 12px 4px 32px;
  margin-left: -26px;
`
const RemoveButton = styled.img`
  width: 20px;
  pointer-events: initial;
  position: relative;
  top: 3px;
`


export default function ConnectMenuManager(props: { otherName: string, setOtherName: Setter<string>, callerType: string }): JSX.Element {
    const [connectButtonIcon, setConnectButtonIcon] = useState<string>()
    const [isConnectMenuOpen, setIsConnectMenuOpen] = useState<boolean>()

    const {
        isCallConnected, myName
    } = useAppContext()

    const rootRef = useRef(null)
    useClickAway(() => setIsConnectMenuOpen(false), rootRef)

    useEffect(() => {
        setConnectButtonIcon(isCallConnected ? HandsGreen1Svg : Hand2Svg)
        if (isCallConnected) setIsConnectMenuOpen(false)
    }, [isCallConnected])

    useEffect(function openConnectMenuWhenJoiningWithEmptyName() {
        if (myName === '' && props.otherName.length > 1) setIsConnectMenuOpen(true)
    }, [myName, props.otherName])

    useEffect(() => {
        if (props.callerType != null) setIsConnectMenuOpen(false)
    }, [props.callerType])

    return <div ref={rootRef}>
        {!isConnectMenuOpen ?
            <div style={{ paddingBottom: '12px' }}>
                {props.otherName != '' && !isCallConnected && <div style={{ display: 'inline-block', marginRight: '16px', marginBottom: '4px' }}>
                    <RemoveButton
                        id="RemoveButton"
                        src={XCircleSvg}
                        onClick={() => { props.setOtherName('') }} />
                    <OtherName>{props.otherName}</OtherName>
                </div>}
                <ConnectButton
                    id="ConnectOpenButton"
                    onClick={e => {
                        e.stopPropagation()
                        setIsConnectMenuOpen(true)
                    }}
                    {...{ isCallConnected }}
                >
                    <img src={connectButtonIcon} />
                </ConnectButton>
            </div>
            :
            <ConnectMenu otherName={props.otherName} setOtherName={props.setOtherName}>
                <ConnectButton
                    id="ConnectCloseButton"
                    {...{ isCallConnected }}
                    small
                    onClick={() => setIsConnectMenuOpen(false)}
                    style={{ float: 'right' }}>
                    <img src={connectButtonIcon} />
                </ConnectButton>
            </ConnectMenu>
        }
    </div>
}
