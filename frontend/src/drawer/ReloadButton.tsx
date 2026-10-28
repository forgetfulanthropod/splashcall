import React, { useEffect, useState } from 'react'
import styled from 'styled-components'

import { emitDataEvent, onDataEvent } from '../connection/dataConn'
import { useAppContext } from '../context'
import { noSelect } from '../css-snippets.json'

import ReloadSvg from "assets/icons/reload.svg"

const Reload = styled.img`
    ${noSelect}
    margin-left: 18px;
    width: 26px;
    display: inline-block;
    height: 20px;
    transition: .5s;
    &:hover {
        transform: rotate(1turn);
    }
`

export default function ReloadButton(): JSX.Element {
    const { reload$, resizer$ } = useAppContext()
    const [hardReloadTimeout, setHardReloadTimeout] = useState((fn, t) => void [fn, t])

    useEffect(() => {
        onDataEvent('reload', () => {
            resizer$.emit({ type: "resize" })
            reload$.emit({})
        })
        onDataEvent('hardReload', () => {
            location.reload()
        })
    })

    function hardReload() {
        setHardReloadTimeout(setTimeout(
            () => {
                emitDataEvent('hardReload', null)
                location.reload()
            },
            4000
        ))
    }

    function softReload() {
        clearTimeout(hardReloadTimeout)

        resizer$.emit({ type: "resize" })
        reload$.emit({ fromClick: true })
        emitDataEvent('reload', null)
    }

    return <Reload
        id="Reload"
        onPointerDown={() => { hardReload() }}
        onPointerUp={() => softReload()}
        onPointerCancel={() => softReload()}
        onContextMenu={e => e.preventDefault()}
        src={ReloadSvg}
    />
}
