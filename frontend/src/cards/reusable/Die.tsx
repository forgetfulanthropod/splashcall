/** Click a dice to roll it. Derived from https://codesandbox.io/s/xjk3xqnprw . */

import React, { useCallback } from 'react'
import './Dice.css'

type Ref<T> = React.MutableRefObject<T>
export function Die(props: { left: string, top: string, triggerRollRef?: Ref<() => number> }): JSX.Element {
    // const [rollType, setRollType] = useState("evenRoll")
    const [state, setState] = React.useState({ roll: 1, parity: 'evenRoll' })
    const handleClick = useCallback(() => {
        const outcome = randInt(1, 6)
        setState(s => ({
            roll: outcome,
            parity: s.parity === 'evenRoll' ? 'oddRoll' : 'evenRoll'
        }))
        return outcome
    }, [])
    if (props?.triggerRollRef != null) props.triggerRollRef.current = handleClick // allow parent to trigger a roll
    return <ol className={'die ' + state.parity} onClick={handleClick} data-roll={state.roll} style={{ left: props.left, top: props.top }}>
        {repeat(6, i => <li key={i} className={'dieItem'} data-side={i + 1}>
            {repeat(i + 1, j => <span key={j} className={'dot'}></span>)}
        </li>)}
    </ol>
}

function repeat<T>(n: number, f: (index?) => T): T[] {
    return Array(n).fill(null).map((_, i) => f(i))
}

/** End inclusive */
function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min
}
