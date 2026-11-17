export type ShapeName = 'circle' | 'rect' | 'ellipse' | 'triangle' | 'roundRect'
export type IdleName = 'bob' | 'sway' | 'breathe' | 'blink'

export type ObjectPart = {
    shape: ShapeName
    x: number
    y: number
    w: number
    h: number
    color: string
    rotation: number
}

/** What the server returns. No code for an object. A game is HTML, drawn only in a sandbox. */
export type Creation = {
    kind: 'object' | 'game'
    title: string
    idle: IdleName
    background: string
    parts: ObjectPart[]
    gameHtml: string
}

export type CreatedCard = Creation & {
    id: string
    createdAt: number
}
