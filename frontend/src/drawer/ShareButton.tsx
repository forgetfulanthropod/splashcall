import { Share } from '@capacitor/share'
import React from 'react'

function shareUrl(): string {
    return window.location.origin
}

async function doShare(text) {
    await Share.share({
        title: 'See cool stuff',
        text: text,
        url: shareUrl(),
        dialogTitle: 'Share with buddies',
    })
}

export default function ShareButton(props: { text: string }): JSX.Element {
    return <button onClick={() => doShare(props.text)}>Share</button>
}
