export function clampVolume(value: number): number
export function gainFromVolume(volume: number, muted: boolean): number
export function volumeFromVerticalDrag(startValue: number, startY: number, y: number): number
export function volumeFromPoint(x: number, y: number, box: { left: number, top: number, width: number, height: number }): number
export function volumeFromGesture(
    start: { x: number, y: number, value: number },
    point: { x: number, y: number },
    box: { left: number, top: number, width: number, height: number },
): number
export function pieEnd(volume: number, cx: number, cy: number, radius: number): { x: number, y: number }
export function pieWedge(volume: number, cx: number, cy: number, radius: number): string
export function meterScale(rms: number, index: number): number
