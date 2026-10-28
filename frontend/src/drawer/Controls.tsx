import { useClickAway } from 'ahooks'
import React, { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import { useAppContext } from '../context'
import { noSelect } from '../css-snippets.json'
import DrawerContents from './DrawerContents'
import ReloadButton from './ReloadButton'
import VolumeControl from './VolumeControl'

import MutedSvg from 'assets/icons/mic is muted.svg'
import UnmutedSvg from 'assets/icons/mic is on.svg'
import CogSvg from 'assets/icons/cog.svg'

const Root = styled.div<{ isDrawerOpen: boolean }>`
  position: absolute;
  z-index: 100;
  bottom: 0;
  right: 0;
  left: 0;
  ${p => p.isDrawerOpen && 'left: initial; max-width: 600px;'}
  @media only screen and (max-width: 600px){
    left: 0
  }
  display: flex;
  padding: 15px;
  justify-content: flex-end;
  pointer-events: none;
  flex-direction: column;
`

const DrawerButton = styled.a<{ isDrawerOpen: boolean, contentType: ContentType }>`
  ${noSelect}
  align-self: flex-end;
  pointer-events: initial;
  border-radius: ${p => p.isDrawerOpen ? '20px 20px 0 0' : '50%'};
  border: 1px solid gray;
  ${p => p.isDrawerOpen && 'border-bottom: none;'}
  background: ${p => p.isDrawerOpen ? '#DFE5EC' : 'rgba(255,255,255,.8)'};
  position: relative;
  ${p => p.isDrawerOpen && 'top:2px;'}
  display: inline-block;
  cursor: pointer;
  width: 60px;
  height: 60px;

  /* Round div holding the gear image */
  .settings {
    background: rgba(120,120,120,.9);
    width: 28px;
    height: 28px;
    position: absolute;
    right: 0;
    transform: translate(50%, -50%);
    border-radius: 50%;
    border: 1px solid #ddd;
    img {
      width: 18px;
      margin: 5px;
    }
    ${p => p.contentType === 'settings' && `
      width: 32px;
      height: 32px;
      transform: none;
      left: 12px;
      top: 12px;
      line-height: 32px;
      background: rgba(140,140,140,.9);
      img {
        width: 20px;
        margin: 6px;
      }
    `}
  }

  /* One div with this class for each rectangle */
  .card {
    display: inline-block;
    width: 22px;
    height: 44px;
    position: absolute;
    left: 18px;
    top: 8px;
    border-radius: 3px;
    box-shadow: 1px 1px 3px 0 #666;
    pointer-events: none;
    transition: transform .4s;
    /* Counts according to DrawerButton */
    &:nth-child(1) {
      transform: rotate(-32deg);
      background: rgb(255, 205, 112);
    }
    &:nth-child(2) {
      transform: rotate(32deg);
      background: rgb(245, 66, 75);
    }
    &:nth-child(3) {
      transform: rotate(16deg);
      background: rgb(173, 252, 255);
    }
    &:nth-child(4) {
      transform: rotate(-16deg);
      background: rgb(235, 173, 255);
    }
    &:nth-child(5) {
      background: #8FDBF4;
    }
  }
  &:hover {
    .card {
      &:nth-child(1) {
        transform: rotate(-16deg);
      }
      &:nth-child(2) {
        transform: rotate(16deg);
      }
      &:nth-child(3) {
        transform: rotate(8deg);
      }
      &:nth-child(4) {
        transform: rotate(-8deg);
      }
    }
  }
`

const BottomLeftButtonWrap = styled.div<{ isDrawerOpen: boolean }>`
  ${noSelect}
  position: absolute;
  left: ${p => p.isDrawerOpen ? '26px' : '15px'};
  bottom: ${p => p.isDrawerOpen ? '20px' : '15px'};
  transition: .4s;
  & > *:first-child {
    margin-right: 12px;
  }
  & > * {
    pointer-events: initial;
  }
`

type ContentType = 'cards' | 'settings'
export default function Controls(): JSX.Element {
  const {
    isMicMuted, setIsMicMuted,
    settings: { id },
    settings
  } = useAppContext()
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [contentType, setContentType] = useState<ContentType>()
  const rootRef = useRef(null)
  useClickAway(() => {
    setIsDrawerOpen(false)
    setContentType('cards')
  }, rootRef)
  useEffect(() => {
    setIsDrawerOpen(false)
    setContentType('cards')
  }, [id])

  const hasSettings =
    (settings?.drawer != null && Object.keys(settings?.drawer).length > 0)
    || settings?.sourceUrl != null

  return <Root {...{ isDrawerOpen }} ref={rootRef}>
    <BottomLeftButtonWrap {...{ isDrawerOpen }}>
      {isMicMuted ?
        <img
          id="MuteButton"
          onClick={() => setIsMicMuted(false)}
          src={MutedSvg}
          style={{ width: '20px' }} /> :
        <img
          id="MuteButton"
          onClick={() => setIsMicMuted(true)}
          src={UnmutedSvg}
          style={{ width: '16px' }} />
      }
      <VolumeControl />
      <ReloadButton />
    </BottomLeftButtonWrap>

    {/* maybe bind drag here to cover button and contents.. */}
    {/* TODO: fix: changing onClick to onPointerUp causes random texture switching */}
    <DrawerButton
      id="DrawerButton"
      onClick={() => {
        setIsDrawerOpen(isOpen => !isOpen || contentType !== 'cards')
        setContentType('cards')
      }}
      {...{ isDrawerOpen, contentType }} >
      {contentType === 'cards' && <>
        <div className="card"></div>
        <div className="card"></div>
        <div className="card"></div>
        <div className="card"></div>
        <div className="card"></div>
      </>}
      {hasSettings && <div className="settings"
        onClick={e => {
          e.stopPropagation()

          setIsDrawerOpen(isOpen => {
            if (isOpen) setContentType('cards')
            else setContentType('settings')

            return !isOpen
          })

        }}
      >
        <img src={CogSvg} alt="settings" />
      </div>}
    </DrawerButton>

    <DrawerContents {...{ isDrawerOpen, type: contentType }} />
  </Root>
}
