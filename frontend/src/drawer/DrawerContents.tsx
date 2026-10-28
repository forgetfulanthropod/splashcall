import React from 'react'
import styled from 'styled-components'

import { noSelect } from '../css-snippets.json'
import { useAppContext } from '../context'
import SettingInput from './SettingInput'
import CardSwitcher from './CardSwitcher'

const Root = styled.div<{ isDrawerOpen: boolean }>`
    ${noSelect}
    max-height: ${p => p.isDrawerOpen ? '800px' : '0px'};
    padding: ${p => p.isDrawerOpen ? '12px 12px 48px 12px' : '0px'};
    pointer-events: initial;
    border-radius: 20px 0 20px 20px;
    display: inline-block;
    background: #DFE5EC;
    border: ${p => p.isDrawerOpen ? '1px solid gray' : 'none'};
    transition: .4s;
    transition: max-height .4s ease-out;
    overflow: hidden;
    text-align: right;
`

export default function DrawerContents({ isDrawerOpen, type }: { isDrawerOpen: boolean, type: 'cards' | 'settings' }): JSX.Element {
    const {
        settings, setSettings,
    } = useAppContext()

    function setSetting(settingKey: string, settingValue) {
        setSettings(settings => ({
            ...settings,
            drawer: {
                ...settings.drawer,
                [settingKey]: {
                    ...settings.drawer[settingKey],
                    value: settingValue
                }
            }
        }))
    }

    return <Root {...{ isDrawerOpen }}>
        {type === 'cards' && isDrawerOpen && <CardSwitcher />}
        {type === 'settings' &&
            <>
                {isDrawerOpen && settings?.drawer != null && Object.entries(settings.drawer).map(([k, s]) =>
                    <SettingInput settingKey={k} setting={s} setSetting={setSetting} key={k} />)}
                {settings.sourceUrl != null && <div>Derived from open <a target="_blank" rel="noreferrer" href={settings.sourceUrl}>source</a></div>}
            </>}
    </Root>
}
