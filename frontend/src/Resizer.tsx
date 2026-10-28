import { useEventListener, useSize } from 'ahooks'
import React, { CSSProperties, useEffect, useMemo, useRef } from 'react'
import { useAppContext, ResizerEvent } from './context'
import { platform } from './environment'
import { useEffectWhen } from './hooks'

const consistentStyles: CSSProperties = {
    position: 'absolute',
    margin: 'auto',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    background: '#BBB',
}

const dynamicSize = (ratio): CSSProperties => ({
    height: `${(100 / ratio).toFixed(2)}vw`,
    maxWidth: `${(100 * ratio).toFixed(2)}vh`,
    width: `100vw`,
    // account for ios safari top & bottom bars:
    maxHeight: 'calc(100vh - calc(100vh - 100%))',
})

const staticSize = (ratio: number): CSSProperties => {
    const { height, width } = aspectToShape(ratio)
    return {
        height: `${height}px`,
        maxHeight: `${height}px`,
        width: `${width}px`,
        maxWidth: `${width}px`,
        top: (window.innerHeight - height) / 2,
        left: (window.innerWidth - width) / 2,
        margin: null,
        right: null,
        bottom: null,
    }
}

function aspectToShape(ratio: number) {
    const w = window.innerWidth
    const h = window.innerWidth / ratio
    const scale = h <= window.innerHeight ? 1 : window.innerHeight / h
    return { width: w * scale, height: h * scale }
}

const isAndroidWeb = navigator.userAgent.toLowerCase().indexOf('android') > -1
const wantStaticSize = (
    isAndroidWeb ||
    platform === 'ios' ||
    platform === 'android'
)
const sizeStyler = wantStaticSize ? staticSize : dynamicSize

export default function Resizer({ children }: { children: React.ReactNode }): JSX.Element {
    const ref = useRef()
    const { reload$, resizer$, aspect, setAspect, callerType } = useAppContext()
    const { width: nodeWidth, height: nodeHeight } = useSize(ref)

    useEventListener('resize', () => setAspect(a => ({ ...a, my: document.documentElement.clientWidth / document.documentElement.clientHeight })))
    useEffect(() => { if (callerType == null) setAspect(a => ({ ...a, other: null })) }, [callerType, setAspect])
    // if preserveAspectRatio ....
    resizer$.useSubscription((event: ResizerEvent) => {
        if (event.type === "setUsed") { setAspect(a => ({ ...a, used: event.used, needsResize: true })) }
        else if (event.type === "setOther") {
            if (event.resize) {
                setAspect(a => ({ ...a, other: event.other, used: reconcile(a.my, event.other), needsResize: true }))
            } else {
                setAspect(a => ({ ...a, other: event.other }))
            }
        }
        else if (event.type === "resize") { setAspect(a => ({ ...a, used: reconcile(a.my, a.other), needsResize: true })) }
    })
    useEffectWhen(
        () => {
            if (!aspect.needsResize) { return }
            if (nodeWidth == aspect.screenInfo.width && nodeHeight == aspect.screenInfo.height) {// no change
                setAspect(a => ({ ...a, needsResize: false }))
                return
            }
            setAspect(a => ({ ...a, needsResize: false, screenInfo: { width: nodeWidth, height: nodeHeight } }))
            reload$.emit({})
        },
        [aspect, nodeHeight, nodeWidth, reload$, setAspect],
        [nodeWidth, nodeHeight]
    )

    return useMemo(() =>
        <div style={{ ...consistentStyles, ...sizeStyler(aspect.used) }} ref={ref}>
            {children}
        </div>,
        [aspect.used, children])
}

function reconcile(ratio1: number, ratio2?: number): number {
    const min = ratio2 == null ? ratio1 : Math.min(ratio1, ratio2)
    const clip = (lower, x, upper) => Math.min(upper, Math.max(lower, x))
    return clip(6 / 13, min, 13 / 6)
}
