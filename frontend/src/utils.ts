import toast from "react-hot-toast"

type Func<Args extends unknown[], Out> = (...args: Args) => Out
type AsyncFunc<Args extends unknown[], Out> = (...args: Args) => Promise<Out>

/** Function wrapper for debugging
 * Want to debug your function f?
 * `export f = debug(function f(whatever){return})
*/

const defaultConfig: { stack?: boolean, name?: string } = { stack: false, name: undefined }

export function debug<Args extends unknown[], Out>(func: Func<Args, Out>, config = defaultConfig): Func<Args, Out> {
    const name = config.name ?? func.name
    function debugFunc(...args: Args): Out {
        const id = rand()
        const [d1, t1] = getTime()
        console.log(`${name}#${id} called with`, ...args, 'at', t1)
        if (config.stack) {
            console.log(new Error(`${name}#${id} debugstack:`).stack)
        }
        const result = func(...args)
        const [d2, t2] = getTime()
        console.log(`${name}#${id} return with`, result, `at ${t2} (+${(d2.getTime() - d1.getTime()).toLocaleString()}ms)`)
        return result
    }
    Object.defineProperty(debugFunc, 'name', { value: 'debug-' + name })
    return debugFunc
}


/** Async version of `debug` */
export function adebug<Args extends unknown[], Out>(func: AsyncFunc<Args, Out>, config = defaultConfig): AsyncFunc<Args, Out> {
    const name = config.name ?? func.name
    async function debugFunc(...args: Args): Promise<Out> {
        const id = rand()
        const [d1, t1] = getTime()
        console.log(`${name}#${id} called with`, ...args, 'at', t1)
        if (config.stack) {
            console.log(new Error(`${name}#${id} debugstack:`).stack)
        }
        const result = await func(...args)
        const [d2, t2] = getTime()
        console.log(`${name}#${id} return with`, result, `at ${t2} (+${(d2.getTime() - d1.getTime()).toLocaleString()}ms)`)
        return result
    }
    Object.defineProperty(debugFunc, 'name', { value: 'debug-' + name })
    return debugFunc
}


function getTime(): [Date, string] {
    const date = new Date()
    return [date, `${date.getMinutes()}m-${date.getSeconds()}s-${date.getMilliseconds()}ms`]
}

/** Generate a random string of a given length */
export function rand(length = 4, useLetters = false): string {
    const base = useLetters ? 36 : 10
    return Math.random().toString(base).slice(-length)
}

export function random(lower: number, upper: number): number {
    return Math.random() * (upper - lower) + lower
}

/** Remember to await this! */
export async function sleep(milliseconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, milliseconds))
}

export function watch(func: () => unknown, name: string): void {
    let last = null
    setInterval(() => {
        const newVal = func()
        if (newVal !== last) {
            console.log(`Watcher '${name}'`, { last, newVal })
        }
        last = newVal
    }, 1000)
}

export function arrayEquals(A1: unknown, A2: unknown): boolean {
    return Array.isArray(A1) &&
        Array.isArray(A2) &&
        A1.length === A2.length &&
        A1.every((x, i) => A2[i] === x)
}

type Obj = Record<string, unknown>
/** Shallow */
export function objectEquals(o1: Obj, o2: Obj): boolean {
    if (o1 == null && o2 == null) return true // both nullish
    if (o1 == null || o2 == null) return false // one is nullish but not the other
    for (const k in o1) if (o1[k] !== o2[k]) return false
    for (const k in o2) if (o1[k] !== o2[k]) return false
    return true
}


/** End exclusive! */
export function range(start: number, end: number, interval = 1): number[] {
    const arr = []
    for (let i = start; i < end; i += interval) {
        arr.push(i)
    }
    return arr
}

export function setAt<T>(A: T[], i: number, x: T): T[] {
    const B = A.slice()
    B[i] = x
    return B
}

/** Makes short strings larger and long strings shorter */
export function fitText({ el, targetWidth, maxFontSize }: { el: HTMLElement, targetWidth: number, maxFontSize?: number }): void {
    if (el.innerText.trim() == '') throw new Error('empty target')
    const testEl = el.cloneNode(true) as HTMLElement
    // console.log(testEl.innerText, el.innerText)
    const s = testEl.style
    s.position = 'absolute'
    s.opacity = '0'
    s.whiteSpace = 'nowrap'
    s.display = 'inline-block'
    s.fontSize = '42px'
    document.body.appendChild(testEl)
    testEl.innerText = el.innerText
    let testElWidth = testEl.clientWidth

    // console.log({ targetWidth, testElWidth })

    let targetWidthDistance = targetWidth - testElWidth
    let count = 0
    let first = true, second = true

    // console.log({ elText: el.innerText, testElText: testEl.innerText })
    while (targetWidthDistance > 25 || targetWidthDistance < 0) {

        const fontSize = Number.parseFloat(testEl.style.fontSize)

        if (first || second) {
            testEl.style.fontSize = fontSize * targetWidth / testElWidth + 'px'
            first = false
            if (!first) second = false
        } else {
            const bump = targetWidthDistance > 25
                ? (fontSize * .005)
                : (- fontSize * .01)
            testEl.style.fontSize = fontSize + bump + 'px'
            // console.log({ fontSize: fontSize + bump + 'px' })
        }

        testElWidth = testEl.clientWidth
        targetWidthDistance = targetWidth - testElWidth
        count++; if (count > 1000) throw new Error('just tried 1000 times!')
    }
    if (maxFontSize != null && parseFloat(testEl.style.fontSize) > maxFontSize) {
        el.style.fontSize = `${maxFontSize}px`
    } else {
        el.style.fontSize = testEl.style.fontSize
    }
    testEl.remove()
}

/** Uses true/false instead of a tab counter because it fails by allowing duplicate tabs instead of failing by preventing all tabs. */
export function initializeTabChecker(): boolean {
    const isAnotherTabOpen = localStorage.getItem('isTabOpen') === 'yes'
    localStorage.setItem('isTabOpen', 'yes')
    window.addEventListener('beforeunload', () => localStorage.setItem('isTabOpen', 'no'))
    window.addEventListener('unload', () => localStorage.setItem('isTabOpen', 'no')) // browser compatibility
    return isAnotherTabOpen
}


export function eztoast(x: unknown): void {
    toast(JSON.stringify(x))
}

export function ezlog(x: unknown): void {
    console.log(JSON.stringify(x))
}

export function clamp(value: number, lower: number, upper: number): number {
    return Math.min(upper, Math.max(value, lower))
}

/** Must have objects with same keys throughout structure, and nullish values in the same places */
// export function isSameShape(o1: Obj, o2: Obj): boolean {
//     if (!hasSameKeys(o1, o2)) { return false }
//     for (const k of Object.keys(o2)) {
//         const v1 = o1[k]
//         const v2 = o2[k]
//         if (v1 == null && v2 == null) { continue }
//         if (v1 == null || v2 == null) { return false }
//         if (typeof (v1) !== 'object' && typeof (v2) !== 'object') { continue }
//         if (typeof (v1) !== 'object' || typeof (v2) !== 'object') { return false }
//         if (!isSameShape(v1 as Obj, v2 as Obj)) { return false }
//     }
//     return true
// }

// function hasSameKeys(o1: Obj, o2: Obj): boolean {
//     const ks1 = Object.keys(o1).sort()
//     const ks2 = Object.keys(o2).sort()
//     return ks1.length === ks2.length && ks1.every((k, i) => k === ks2[i])
// }
