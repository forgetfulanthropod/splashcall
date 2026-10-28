/** Entire menu on top of the screen. */

import React from 'react'
import styled from 'styled-components'
import { useAppContext } from '../context'
import { noSelect } from '../css-snippets.json'
import NameEditor, { Label } from './NameEditor'
import { doCall, hangup } from './peerConnection'

import SplashcallnameSvg from 'assets/icons/splashcall-name.svg'
import CopySvg from 'assets/icons/copy.svg'
import ShareSvg from 'assets/icons/share.svg'
import PhonehangupSvg from 'assets/icons/phone-hang-up.svg'


const Root = styled.div`
  pointer-events: none;
`
const ShareCallMenu = styled.div`
  pointer-events: initial;
  border-radius: 12px;
  border: 1px solid gray;
  background: #fff;
  margin-bottom: 10px;
  & > *:first-child {
    padding: 10px 10px 0 10px;
  }
  & > *:nth-child(2) {
    border-top: 1px solid gray;
  }
`
const CopyShareSection = styled.div`
  display: flex;
  padding: 0 10px 0 10px;
`
const CopyShareButton = styled.a`
  ${noSelect}
  flex-grow: 1;
  width: 50%;
  text-align: center;
  padding: 10px 15px 20px 15px;
  cursor: pointer;
  vertical-align: center;
  &:last-child:not(:first-child) {
    border-left: 1px solid gray;
  }
  & > img {
    width: 25px;
    position: relative;
    top: 8px;
  }
`
const Or = styled.div`
  pointer-events: none;
  background: gray;
  border-radius: 1px;
  width: 100%;
  text-align: center;
  height: 2px;
  margin-top: 35px;
  margin-bottom: 35px;
  & > span {
    ${noSelect}
    display: inline-block;
    width: 36px;
    height: 36px;
    line-height: 33px;
    color: gray;
    background: #fafafa;
    border-radius: 100%;
    position: relative;
    top: -14px;
  }
`
const JoinCallMenu = styled.div`
  pointer-events: initial;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid gray;
  background: #fff;
  text-align: center;
`
const FirstConnectionPanel = styled.div`
  pointer-events: initial;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid gray;
  background: #fff;
  text-align: center;
  margin-bottom: 12px;
`

type Children = JSX.Element[] | JSX.Element
export default function ConnectMenu(props: { children: Children, otherName, setOtherName }): JSX.Element {
  const { isCallConnected, myName, setMyName } = useAppContext()
  const hand = props.children

  const attemptingFirstConnection = myName === '' && props.otherName.length > 1

  return <Root>
    {!isCallConnected ?
      <>
        {attemptingFirstConnection &&
          <FirstConnectionPanel>
            <div style={{ overflow: 'hidden', marginBottom: '-40px' }}>{hand}</div>
            <div style={{ maxWidth: '500px', margin: 'auto', color: '#666' }}>
              <div style={{ textAlign: 'left', lineHeight: '40px' }}>enter name to join a </div>
              <img src={SplashcallnameSvg} alt="splashcall" style={{ maxWidth: '250px' }} />
              <div style={{ textAlign: 'right', marginTop: '-18px' }} >
                with <span style={{ fontSize: '28px' }}>{props.otherName}</span>
              </div>
            </div>
          </FirstConnectionPanel>
        }
        <ShareCallMenu>
          <NameEditor
            label="YOUR NAME"
            value={myName}
            onUpdate={v => setMyName(v)}
          >
            {!attemptingFirstConnection && hand}
          </NameEditor>
          {myName != '' &&
            <CopyShareSection>

              <CopyShareButton onClick={copy}>
                <img src={CopySvg}></img> copy
              </CopyShareButton>
              {navigator.share != null && <CopyShareButton onClick={share}>
                <img src={ShareSvg}></img> share
              </CopyShareButton>}

            </CopyShareSection>
          }
        </ShareCallMenu>

        {myName != '' && <>
          <Or><span>or</span></Or>
          <JoinCallMenu>
            <NameEditor
              label="ENTER THEIR NAME"
              value={props.otherName}
              onUpdate={v => { props.setOtherName(v); doCall(v) }}
              hasClearButton
            />
          </JoinCallMenu>
        </>}
      </> :
      <ShareCallMenu>
        <div style={{ textAlign: 'left', overflow: 'hidden' }}>
          <Label>you are on a call with {props.otherName}</Label>
          {hand}
        </div>
        <CopyShareSection>

          <CopyShareButton
            onClick={() => hangup(true, true)}>
            <img src={PhonehangupSvg}></img> hang up
          </CopyShareButton>

        </CopyShareSection>
      </ShareCallMenu>
    }
  </Root >
}

function copy() {
  navigator.clipboard
    .writeText(location.href)
    .then(() => console.log('copied'), () => console.log('hmm that didn\'t work'))
}

async function share() {
  await navigator.share({ title: 'this is my Splashcall link', url: location.href })
}
