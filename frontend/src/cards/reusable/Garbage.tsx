import React from "react"
import styled from "styled-components"
import { useIsPointerOver } from "../../hooks"
import TrashSvg from "assets/icons/trash.svg"
const GarbageImg = styled.img<{
    shouldScale: boolean
    show: boolean
}>`
    position: absolute;
    right: 15px;
    bottom: 105px;
    background: white;
    opacity: 50%;
    border-radius: 50%;
    padding: 10px;
    z-index: 99;
    transition: 0.1s ease-in-out;
    ${p => p.shouldScale && `transform: scale(1.25);`}
    ${p => !p.show && `opacity: 0%;`}
    `

export function Garbage(props: {
    handlePointerUp: () => void,
    show: boolean
}): JSX.Element {
    const [onRef, isPointerOver] = useIsPointerOver({ handlePointerUp: props.handlePointerUp })
    return <GarbageImg
        ref={onRef}
        show={props.show}
        shouldScale={isPointerOver}
        // onPointerUp={props.handlePointerUp}
        width="30px"
        height="30px"
        src={TrashSvg} />
}
