import React, { useCallback, useEffect, useRef, useState } from 'react'

import styled from 'styled-components'
import { noSelect } from '../css-snippets.json'
import { fitText } from '../utils'

import XCircleSvg from 'assets/icons/x-circle.svg'
import EditSvg from 'assets/icons/edit.svg'
import ArrowRightSvg from 'assets/icons/arrow-right-circle.svg'
import { reservedNames } from './WonderSync'

export const Label = styled.label`
  ${noSelect}
  font-size: 12px;
  font-weight: bold;
  color: gray;
  line-height: 20px;
`
const Name = styled.div`
  text-align: center;
  font-size: 32px;
  margin: 0 12px 8px 12px;
  white-space: nowrap;
`
const NameInput = styled.input`
  border: none;
  border-radius: 12px;
  font-size: 32px;
  width: 80%;
  color: gray;
  margin: 0 12px 8px 12px;
  text-align: center;
  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  outline: none;
  box-shadow: 0 0 0 2px rgb(158,231,255);
`
const IconButton = styled.img`
  padding-bottom: 6px;
`

export default function NameEditor(props: { children?: React.ReactNode, label: string, value: string, onUpdate: (v) => void, hasClearButton?: boolean }): JSX.Element {
    const [isEditing, setIsEditing] = useState(props.value == '')
    const [nameStyles, setNameStyles] = useState({ fontSize: '32px', width: null, height: '37px', borderRadius: '12px 19px 19px 12px', paddingRight: '37px', marginRight: '-37px' })

    const preventEditing = reservedNames.find(name => props.value === name)

    const nameEl = useRef(null)
    useEffect(() => {
        updateNameInputStyles(nameEl, setNameStyles)
    }, [isEditing])

    const inputRef = useRef(null)
    useEffect(() => {
        if (inputRef.current == null) return

        inputRef.current.value = props.value
        inputRef.current.focus()

    }, [isEditing, inputRef, props.value])

    const update = useCallback(() => {
        const val = inputRef.current.value
        props.onUpdate(val)
        if (val != '') setIsEditing(false)
    }, [props, inputRef])


    const clear = useCallback(() => {
        if (inputRef.current != null) {
            inputRef.current.value = ''
            update()
        } else {
            props.onUpdate('')
        }
    }, [inputRef, update, props])

    return <div>
        <div style={{ textAlign: 'left', paddingBottom: '12px', }}>
            <Label>{props.label}</Label>
            {props.children}
        </div>
        <div style={{ textAlign: 'center', display: 'flex', justifyContent: 'center', paddingBottom: '12px' }}>

            {props.hasClearButton && props.value != '' &&
                <img src={XCircleSvg}
                    style={{ width: '20px', float: 'left', marginRight: '6px', }}
                    onClick={() => clear()}
                />
            }
            {!preventEditing && props.value != '' &&
                <img src={EditSvg}
                    style={{ width: '20px', marginRight: '6px', }}
                    onClick={() => setIsEditing(is => !is)}
                />
            }

            <Name
                ref={nameEl}
                onDoubleClick={() => setIsEditing(true)}
                style={{
                    ...(isEditing ? {
                            position: 'absolute',
                            left: 1000,
                        }: {}
                    )
                }}
            >
                {props.value}
            </Name>

            {!isEditing ?
                <></> :
                <div style={{ display: 'flex', width: nameStyles.width }}>
                    <NameInput
                        id="NameInput"
                        ref={inputRef}
                        type="text"
                        placeholder="--------"
                        onBlur={() => update()}
                        onChange={e => {
                            e.target.value = standardize(e.target.value)

                            nameEl.current.innerText = e.target.value

                            updateNameInputStyles(nameEl, setNameStyles)
                        }}
                        onKeyDown={e => e.key == 'Enter' && update()}
                        style={nameStyles}
                        autoComplete="off"
                    />
                    <IconButton
                        src={ArrowRightSvg}
                        onClick={() => update()}
                        style={{
                            height: `${Math.abs(parseInt(nameStyles.marginRight)) * .5}px`,
                            padding: nameStyles.marginRight != null ? `${Math.abs(parseInt(nameStyles.marginRight)) * (1 - .5) / 2}px` : ''
                        }}
                    />
                </div>
            }
        </div>
    </div>
}

function updateNameInputStyles(nameEl: React.MutableRefObject<HTMLDivElement>, setNameStyles: React.Dispatch<React.SetStateAction<{ fontSize: string; width: string; height: string; borderRadius: string; paddingRight: string; marginRight: string }>>) {
    if (nameEl.current == null || nameEl.current.innerText == '') return

    console.log('UPDATING NAME_EL STYLES!!!!!')

    fitText({ el: nameEl.current, targetWidth: 250, maxFontSize: 54 })

    const width = nameEl.current.getBoundingClientRect().width
    const height = nameEl.current.getBoundingClientRect().height

    setNameStyles({
        fontSize: nameEl.current.style.fontSize,
        width: `${width + height}px`,
        height: `${height}px`,
        borderRadius: `12px ${height / 2}px ${height / 2}px 12px`,
        paddingRight: `${height}px`,
        marginRight: `-${height}px`,
    })
}

function standardize(s: string) {
    return s.toLowerCase().replaceAll(' ', '-').replaceAll(/[^a-z-]/g, '')
}
