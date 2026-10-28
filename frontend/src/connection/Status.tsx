/** Simple status color UI thing */

import React, { useState } from 'react'
import styled from 'styled-components'
import { useAppContext } from '../context'
import { onStatusChange, STAT } from './dataConn'


const StatusColor = styled.div<{ dataStatusColor: string }>`
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: ${p => p.dataStatusColor};
`
export default function Status(): JSX.Element {
    const [dataStatusColor, setDataStatusColor] = useState<string>()
    const { setIsCallConnected } = useAppContext()

    const statuses = {
        [STAT.Cold]: '#C5C5C5',
        [STAT.Connecting]: '#fff',
        [STAT.StaleNoReceive]: '#F9A811',
        [STAT.StaleReceive]: '#F4F400',
        [STAT.Connected]: '#01D029',
    }
    onStatusChange((s: STAT) => {
        setDataStatusColor(statuses[s])
        if (s === STAT.Connected) {
            setIsCallConnected(true)
        } else {
            setIsCallConnected(false)
        }
    })

    return <StatusColor {...{ dataStatusColor }} />
}
