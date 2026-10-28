import React, { useCallback, useEffect, useRef, useState } from 'react'
import pinch from 'touch-pinch'
import styled from 'styled-components'
import produce from 'immer'

import { useAppContext } from '../context'
import { useEffectWhen, useOnRef, useUpdateEffectWhen } from '../hooks'
import { clearDataEvent, emitDataEvent, emitBigDataEvent, onDataEvent } from '../connection/dataConn'
import { useSize } from 'ahooks'
import { Garbage } from './reusable/Garbage'
import ArrowUpSvg from 'assets/icons/arrow-up-circle.svg'

const PhotoWrap = styled.div`
    position: absolute;
    width: 50%;
    padding: 8px 8px 40px 8px;
    box-sizing: content-box;
    img {
        border-radius: 6px;
        box-shadow: 0 0 0 1px gray, 0 0 0 8px white, 0 32px 0 8px white, 0 0 2px 8px gray, 0 32px 2px 8px gray;
        width: 100%;
    }
`

const PhotoInput = styled.label`
    background: skyblue;
    width: min(30vw, 120px);
    height: min(30vw, 120px);
    border-radius: 50%;
    position: absolute;
    bottom: 60px;
    left: 50%;
    transform: translateX(-50%);
    & > img {
        width: min(30vw, 120px);
    }
`

const EmptyPhotoArea = styled.label`
    background: #eee;
    padding: 12px;
    border-radius: 6px;
    box-shadow: 0 0 0 1px gray, 0 0 0 8px white, 0 24px 0 8px white;
    width: 80%;
    max-width: 400px;
    position: absolute;
    top: 40%;
    left: 50%;
    transform: translate(-50%,-50%);
    & > * {
        font-family: sans-serif;
        font-size: min(20vw, 64px);
        line-height: min(16vw, 54px);
        font-weight: bold;
        color: #666;
    }
    & > *:last-child {
        margin-top: min(12vw, 66px);
        font-size: 16px;
        font-weight: initial;
    }
`

interface Photo {
    title: string
    x?: number
    y?: number
    zoom?: number
    rotate?: number
    data: string
}

export default function PhotoStack(): JSX.Element {
    const [photos, setPhotos] = useState([])
    const [curPhoto, setCurPhoto] = useState<string>(null)
    const { callerType, isCallConnected } = useAppContext()

    const setTopPhoto = useCallback((title) => {
        setPhotos(photos => {
            if (photos.find(photo => photo.title === title) == null) {
                return photos
            } else {
                return [...photos.filter(photo => photo.title !== title), photos.find(photo => photo.title === title)]
            }
        })
    }, [])

    useEffect(() => {
        if (!isCallConnected || callerType !== 'guest') return

        emitDataEvent('PhotoStack-requestPhotos', null)
    }, [callerType, isCallConnected])

    const sendAllPhotos = useCallback(() => {
        photos.forEach(p => emitBigDataEvent('PhotoStack-photo', p))
    }, [photos])

    useEffectWhen(function attachDataEventHandlers() {
        onDataEvent('PhotoStack-photo', (newPhoto: Photo) => {
            setPhotos(oldPhotos => {
                const uniqueOldPhotos = oldPhotos.filter(
                    op => op.title !== newPhoto.title
                )
                return [...uniqueOldPhotos, newPhoto]
            })
        })
        onDataEvent('PhotoStack-photoMeta', (updatedPhotoMeta: Photo) => {
            setPhotos(photos => {
                const oldPhotoIndex = photos.findIndex(p => p.title === updatedPhotoMeta.title)
                return produce(photos, draft => {
                    draft[oldPhotoIndex] = { ...photos[oldPhotoIndex], ...updatedPhotoMeta }
                })
            })
        })
        onDataEvent('PhotoStack-remove', ({ title }) => {
            setPhotos(photos => photos.filter(p => p.title !== title))
        })
        onDataEvent('PhotoStack-down', ({ title }) => {
            setTopPhoto(title)
        })
        onDataEvent('PhotoStack-requestPhotos', sendAllPhotos)

        return () => {
            clearDataEvent('PhotoStack-photo')
            clearDataEvent('PhotoStack-photoMeta')
            clearDataEvent('PhotoStack-remove')
            clearDataEvent('PhotoStack-down')
            clearDataEvent('PhotoStack-requestPhotos')
        }
    }, [setTopPhoto, sendAllPhotos], [sendAllPhotos])

    const input = useRef(null)
    function uploadFiles() {
        const files = input.current.files
        const fl = files.length
        let i = 0

        while (i < fl) {
            // localize file var in the loop
            const fr = new FileReader()
            const fileName = files[i].name
            fr.onload = () => {
                const newPhoto: Photo = {
                    title: fileName,
                    zoom: 1,
                    data: fr.result as string
                }

                setPhotos(photos => [...photos.filter(p => p.title !== newPhoto.title), newPhoto])

                emitBigDataEvent('PhotoStack-photo', newPhoto)
            }
            fr.readAsDataURL(files[i])
            i++
        }
    }

    const rootRef = useRef(null)
    const size = useSize(rootRef) as { width, height }

    return <div ref={rootRef} style={{ height: '100%', background: 'radial-gradient(circle, rgba(2,0,36,1) 0%, rgba(121,9,9,1) 35%, rgba(0,0,0,1) 100%)' }}>
        {
            photos.length > 0
                ?
                <>
                    <Garbage
                        show={curPhoto != null}
                        handlePointerUp={
                            () => {
                                if (curPhoto != null) {
                                    emitDataEvent('PhotoStack-remove', { title: curPhoto })
                                    setPhotos(photos =>
                                        photos.filter(p => p.title !== curPhoto))
                                    setCurPhoto(null)
                                }
                            }}
                    />
                    {
                        photos.map((p, i) =>
                            <Photo
                                setCurPhoto={setCurPhoto}
                                key={p.title}
                                photo={p}
                                portion={(i + 1) / photos.length}
                                putOnTop={() => {
                                    setTopPhoto(p.title)
                                }}
                                rootInfo={size}
                            />)}
                </>
                :
                <EmptyPhotoArea htmlFor="photo_input" >
                    <div>Your</div>
                    <div>Photos</div>
                    <div>Here</div>
                    <div>(we don{"'"}t store your photos)</div>
                </EmptyPhotoArea>
        }
        <PhotoInput>
            <img src={ArrowUpSvg} alt="upload images" />
            <input
                id="photo_input"
                ref={input}
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={(e) =>
                    // the timeout makes state update in the right order
                    setTimeout(() => {
                        uploadFiles()
                        // for re-uploading last file
                        e.target.value = ''
                    }, 100)}
            />
        </PhotoInput>
    </div>
}

function Photo(
    { photo, portion, putOnTop, rootInfo, setCurPhoto }:
        { photo: { title, data, x?, y?, zoom?, rotate?}, portion: number, putOnTop: () => void, rootInfo: { width, height }, setCurPhoto: (s: string) => void }
): JSX.Element {
    const { aspect: { screenInfo } } = useAppContext()

    const [initialPortion, setInitialPortion] = useState(portion)
    const [hasBeenTouched, setHasBeenTouched] = useState(false)
    const [previousPhoto, setPreviousPhoto] = useState(photo)

    useEffectWhen(() => {
        if (!hasBeenTouched) {
            setInitialPortion(portion)
        }
    }, [hasBeenTouched, portion], [portion])

    useUpdateEffectWhen(function updatePhotoMeta() {
        const differences = {}
        Object.keys(photo)
            .filter(key => photo[key] !== previousPhoto[key])
            .forEach(key => differences[key] = photo[key])

        updateMeta(differences)
        setHasBeenTouched(true)

        setPreviousPhoto(photo)

    }, [photo, previousPhoto], [photo])

    const [ref, updateMeta] = useDragPinchTwist({
        title: photo.title,
        setCurPhoto,
        bounds: rootInfo,
        handleDown() {
            setHasBeenTouched(true)
            putOnTop()

            emitDataEvent('PhotoStack-down', { title: photo.title })
        },
        updateXY(x, y) {
            emitDataEvent('PhotoStack-photoMeta', { title: photo.title, x, y })
        },
        updateZoom(zoom) {
            emitDataEvent('PhotoStack-photoMeta', { title: photo.title, zoom })
        },
        updateRotate(rotate) {
            emitDataEvent('PhotoStack-photoMeta', { title: photo.title, rotate })
        },
    })

    return <PhotoWrap
        ref={ref}
        style={{
            left: `${(hasBeenTouched ? initialPortion : portion) * screenInfo.width / 4}px`,
            top: `${(hasBeenTouched ? initialPortion : portion) * screenInfo.height / 4}px`,
        }}
    >
        <img alt={photo.title} src={photo.data}></img>
    </PhotoWrap>
}

type onRefDrag = (n: HTMLElement) => void
export function useDragPinchTwist(
    { setCurPhoto, title, bounds, handleDown, updateXY, updateZoom, updateRotate, }:
        {
            setCurPhoto: (s: string) => void,
            title: string,
            bounds: Rect,
            handleDown: () => void,
            updateXY: (x: number, y: number) => void,
            updateZoom: (zoom: number) => void,
            updateRotate: (rotate: number) => void,
        }
): [onRefDrag, (m) => void] {

    let isPinching = false
    const elm = useRef(null)

    function onMount(element: HTMLElement) {
        elm.current = element
        const cleanupFns = []

        cleanupFns.push(bindPinch(element))
        cleanupFns.push(bindTwist(element))
        cleanupFns.push(bindDrag(element))

        return () => cleanupFns.forEach(fn => fn())
    }

    function bindDrag(elm: HTMLElement) {
        let isPointerDown = false
        let [downX, downY] = [0, 0]
        elm.addEventListener('pointerdown', handlePointerDown)

        function getElmPos() {
            return [
                parseInt(elm.style.left) || 0, // in case of NaN
                parseInt(elm.style.top) || 0,
            ]
        }

        let elmX, elmY
        function handlePointerDown(event: PointerEvent) {
            handleDown()
            setCurPhoto(title)
            isPointerDown = true;
            [elmX, elmY] = getElmPos()
            // NOTE: has some kind of useful side effect!! Idk what it is.
            elm.getBoundingClientRect();
            [downX, downY] = [event.clientX, event.clientY]

            document.addEventListener('pointermove', handlePointerMove)
            document.addEventListener('pointerup', handlePointerUp)
        }
        function handlePointerUp() {
            isPointerDown = false
            // timeout of 0 makes the state update occur after Garbage does pointerUp
            setTimeout(() => setCurPhoto(null), 0)
            document.removeEventListener('pointermove', handlePointerMove)
            document.removeEventListener('pointerup', handlePointerUp)
        }

        function handlePointerMove(event: PointerEvent) {
            if (isPinching) return

            if (!isPointerDown) return

            const [deltaX, deltaY] = [event.clientX - downX, event.clientY - downY]
            const minShown = 50
            const left = Math.min(Math.max(minShown - elm.clientWidth, elmX + deltaX), bounds.width - 50)
            const top = Math.min(Math.max(minShown - elm.clientHeight, elmY + deltaY), bounds.height - 50)
            elm.style.left = `${left}px`
            elm.style.top = `${top}px`

            updateXY(left / bounds.width, top / bounds.height)

        }

        return function cleanup() {
            elm.removeEventListener('pointerdown', handlePointerDown)
            document.removeEventListener('pointermove', handlePointerMove)
            document.removeEventListener('pointerup', handlePointerUp)
        }
    }

    function bindPinch(elm: HTMLElement) {
        let elmWidth = elm.getBoundingClientRect().width
        pinch(elm)
            .on('start', () => {
                isPinching = true
            })
            .on('change', (distance, prev) => {
                elmWidth += distance - prev
                elm.style.width = `${elmWidth}px`
                updateZoom(elmWidth / bounds.width)
            })
            .on('end', () => {
                isPinching = false
            })

        return () => { }
    }

    function bindTwist(elm: HTMLElement) {
        let lastAngle

        elm.addEventListener('touchstart', touchStart)
        function touchStart(e) {
            if (e.touches.length !== 2) return
            lastAngle = angle([e.touches[0], e.touches[1]])

        }
        elm.addEventListener('touchmove', touchMove)
        function touchMove(e) {
            if (e.touches.length !== 2) return

            const newAngle = angle([e.touches[0], e.touches[1]])

            const setRotation = rotateElement(elm, newAngle - lastAngle)

            updateRotate(setRotation)

            lastAngle = newAngle
        }

        function rotateElement(elm, rotationChange): number {
            const transformParts = elm.style.transform.split('rotate(')
            let finalRotation
            if (transformParts.length === 2) {
                const currentRotate: number = parseInt(transformParts[1])

                elm.style.transform = `rotate(${currentRotate + rotationChange}deg)`

                finalRotation = currentRotate + rotationChange
            } else {
                elm.style.transform = `rotate(${rotationChange}deg)`

                finalRotation = rotationChange
            }

            return finalRotation
        }

        function angle([t1, t2]) {
            const dx = t2.clientX - t1.clientX
            const dy = t2.clientY - t1.clientY

            return (180 / Math.PI) * Math.atan2(dy, dx)
        }

        return () => {
            elm.removeEventListener('touchstart', touchStart)
            elm.removeEventListener('touchmove', touchMove)
        }
    }

    function updateMeta(meta) {
        if (meta.x != null) elm.current.style.left = `${meta.x * bounds.width}px`
        if (meta.y != null) elm.current.style.top = `${meta.y * bounds.height}px`
        if (meta.zoom != null) elm.current.style.width = `${meta.zoom * bounds.width}px`
        if (meta.rotate != null) elm.current.style.transform = `rotate(${meta.rotate}deg)`
    }

    // eslint-disable-next-line
    return [useOnRef(onMount, []), updateMeta]
}

type Rect = { width: number, height: number }
