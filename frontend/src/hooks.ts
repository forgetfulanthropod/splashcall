/** General re-usable hooks */

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useAppContext, ScreenInfo } from './context'
import { emitDataEvent, onDataEvent } from './connection/dataConn'
import { SceneApi } from './textureUtils'
import { rand } from './utils'
import { useEventListener, useUpdateEffect } from 'ahooks'

/** Should work but not tested */
export function useOnRef<T>(onMount: (node: T) => (void | (() => void)), deps: unknown[]): (n: T) => void {
    const onDismountRef = useRef(null)
    const onRef = useCallback((node) => {
        if (onDismountRef.current != null) {
            onDismountRef.current()
            onDismountRef.current = null
        }
        if (node != null) {
            onDismountRef.current = onMount(node)
        }
        // We don't want to watch for onMount changes because we are doing the usecallback ourselves
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps)

    return onRef
}


/** Will initialize a scene and attach its touches, otherTouches, stopTime, and settings.
 *  NOTE 1: createScene must be a static value, either from a module-level function or a useCallback
 *  NOTE 2: Needs to be called be a component with access to Con.
 */
export function useScene<SceneX extends SceneApi, Node extends HTMLElement>(
    createScene: (n: Node, screenInfo: ScreenInfo) => SceneX
): [(n: Node) => void, SceneX] {
    const { settings, aspect: { screenInfo }, touch$ } = useAppContext()
    const sceneRef = useRef<SceneX>(null)
    const [scene, setScene] = useState<SceneX>(null)
    const onRef = useCallback((node: Node) => {
        if (sceneRef.current != null) {
            sceneRef.current.stopTime()
            sceneRef.current = null
            setScene(null)
        }
        if (node != null && screenInfo != null && sceneRef.current == null) {
            const newScene = createScene(node, screenInfo)
            newScene.onTouches(ts => touch$.emit({ type: 'send', touches: ts }))
            sceneRef.current = newScene
            setScene(newScene)
        }
        // We do not currently permit dynamic createScene functions
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    touch$.useSubscription(({ type, touches }) => {
        if (type === 'send') { return }
        sceneRef.current.setOtherTouches(touches)
    })
    useEffect(() => {
        if (sceneRef.current?.setSettings == null) return
        sceneRef.current.setSettings(settings)
    }, [settings])

    return [onRef, scene]
}

/** watchedVals must be a subset of deps */
export function useEffectWhen(effect: React.EffectCallback, deps: unknown[], watchedVals: unknown[]): void {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(useCallback(effect, deps), watchedVals)
}

/** for toasting data when it changes */
export function useToast(data: unknown[]): void {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { toast(JSON.stringify(data)) }, data)
}


export function useNetworkSync<T>(name: string, mine: T): T | null {
    const { isCallConnected } = useAppContext()
    const [other, setOther] = useState<T>(null)
    const uidRef = useRef<string>()
    useEffectWhen(() => {
        if (isCallConnected) {
            uidRef.current = rand(6, true)
            emitDataEvent(name, { data: mine, uid: uidRef.current })
        }
    }, [mine, isCallConnected, name],
        [isCallConnected])
    onDataEvent(name, (other: { data: T, uid: string }) => {
        setOther(other.data)
        if (other.uid != uidRef.current) {
            uidRef.current = other.uid
            emitDataEvent(name, { data: mine, uid: uidRef.current })
        }
    })
    return other
}
export function useUpdateEffectWhen(effect: React.EffectCallback, deps: unknown[], watchedVals: unknown[]): void {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useUpdateEffect(useCallback(effect, deps), watchedVals)
}

export function useIsPointerOver(args?: { handlePointerUp?: () => void }): [(n: Node) => void, boolean] {
    const [isPointerOver, setIsPointerOver] = useState(false)
    const shape = useRef<DOMRect>(null)
    const nodeRef = useRef<HTMLElement>(null)
    useEventListener('pointermove', e => {
        if (shape.current == null) {
            setIsPointerOver(false)
            return
        }
        setIsPointerOver(isWithin(e, shape.current))
    }, { passive: true })

    useEventListener('pointerup', () => {
        if (isPointerOver) { args?.handlePointerUp() }
        setIsPointerOver(false)
    }, { passive: true })

    useEventListener('resize', () => {
        shape.current = nodeRef?.current?.getBoundingClientRect()
    }, { passive: true })

    const onRef = useCallback((node: HTMLElement | null) => {
        if (node == null) {
            shape.current = null
            setIsPointerOver(false)
            nodeRef.current = null
        } else {
            shape.current = node.getBoundingClientRect()
            nodeRef.current = node
        }
    }, [])
    return [onRef, isPointerOver]
}

function isWithin({ clientX: x, clientY: y }: PointerEvent, r: DOMRect): boolean {
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
}
