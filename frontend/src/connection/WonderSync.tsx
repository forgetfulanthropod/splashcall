import React, { useState } from 'react'
import { useAppContext } from '../context'

import styled from 'styled-components'
import { doCall } from './peerConnection'

const ResyncButton = styled.div<{
  minimized: boolean
}>`
  width: 25vw;
  height: 25vw;
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%,-50%);
  background: #550066;
  border-radius: 50%;
  border: 3vw solid white;
  font-size: 6vw;
  cursor: pointer;
  ${({minimized}) => {
    return minimized && `
      width: 5vw;
      height: 5vw;
      border: .8vw solid white;
      font-size: 1vw;
      top: calc(20px + 2.5vw);
    `
  }}
`

const ResyncText = styled.div<{
  minimized: boolean
}>`
  pointer-events: none;
  color: white;
  font-weight: bolder;
  text-align: center;
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%,-50%);
`

const Minimize = styled.div`
  line-height: 18px;
  width: 20px;
  height: 20px;
  display: flex;
  justify-content: center;
  text-align: center;
  border-radius: 50%;
  background: white;
  position: absolute;
  left: calc(50% + 12vw);
  top: calc(50% - 12vw);
  transform: translate(-50%,-50%);
  font-weight: bolder;
  cursor: pointer;
`
const Maximize = styled.div`
  line-height: 18px;
  width: 20px;
  height: 20px;
  display: flex;
  justify-content: center;
  text-align: center;
  border-radius: 50%;
  background: white;
  position: absolute;
  left: calc(50% + 2vw);
  top: 20px;
  transform: translate(-50%,-50%);
  font-weight: bolder;
  cursor: pointer;
`

export const reservedNames = [
  'wonderville-broccoli',
  'wonderville-abacus',
] as const

export default function WonderSync(): JSX.Element {
  const { myName, isCallConnected, setOtherName } = useAppContext()
  const [minimized, setMinimized] = useState(false)

  if (isCallConnected) return <></>

  const reservedNameIndex = reservedNames.findIndex(n => n === myName)

  if (reservedNameIndex === -1) return <></>

  const otherName = reservedNames[(reservedNameIndex + 1) % 2]

  return <>
    <ResyncButton
      minimized={minimized}
      onClick={() => {
        setOtherName(otherName)
        doCall(otherName)
      }}
      >
      <ResyncText
        minimized={minimized}
        >resync</ResyncText>
    </ResyncButton>
    {!minimized && <Minimize onClick={() => setMinimized(true)}>-</Minimize>}
    {minimized && <Maximize onClick={() => setMinimized(false)}>+</Maximize>}
  </>
}
