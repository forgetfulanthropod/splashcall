/**
 * Volume pie math shared by the looper and the tests.
 * 0 is empty. 100 is a full disk. The wedge grows clockwise from 12 o'clock.
 */

function clampVolume(value) {
    const n = Number(value)
    if (!Number.isFinite(n)) return 0
    return Math.max(0, Math.min(100, Math.round(n)))
}

/** What the track gain node should be. Mute wins. */
function gainFromVolume(volume, muted) {
    if (muted) return 0
    return clampVolume(volume) / 100
}

/** Upward drag raises the volume. 100 points across about 140px. */
function volumeFromVerticalDrag(startValue, startY, y) {
    return clampVolume(startValue + (startY - y) * (100 / 140))
}

/**
 * Angle around the pie. 12 o'clock is 0, 3 o'clock is 25, 6 o'clock is 50.
 */
function volumeFromPoint(x, y, box) {
    const cx = box.left + box.width / 2
    const cy = box.top + box.height / 2
    const dx = x - cx
    const dy = y - cy
    let rad = Math.atan2(dx, -dy)
    if (rad < 0) rad += Math.PI * 2
    return clampVolume((rad / (Math.PI * 2)) * 100)
}

/**
 * A tall drag changes volume from the value where the finger went down.
 * A drag around the ring uses the angle. A press in the middle does not jump.
 */
function volumeFromGesture(start, point, box) {
    const cx = box.left + box.width / 2
    const cy = box.top + box.height / 2
    const dist = Math.hypot(point.x - cx, point.y - cy)
    const radius = Math.min(box.width, box.height) / 2
    const movedX = Math.abs(point.x - start.x)
    const movedY = Math.abs(point.y - start.y)
    if (movedY >= 6 && movedY > movedX * 1.25) {
        return volumeFromVerticalDrag(start.value, start.y, point.y)
    }
    if (dist >= radius * 0.35) return volumeFromPoint(point.x, point.y, box)
    return volumeFromVerticalDrag(start.value, start.y, point.y)
}

function pieEnd(volume, cx, cy, radius) {
    const turn = clampVolume(volume) / 100
    const angle = turn * Math.PI * 2
    return {
        x: cx + Math.sin(angle) * radius,
        y: cy - Math.cos(angle) * radius,
    }
}

/** SVG path for the filled wedge. Empty string at 0. A full disk at 100. */
function pieWedge(volume, cx, cy, radius) {
    const turn = clampVolume(volume) / 100
    if (turn <= 0) return ''
    if (turn >= 0.999) {
        return 'M ' + (cx - radius) + ' ' + cy
            + ' A ' + radius + ' ' + radius + ' 0 1 1 ' + (cx + radius) + ' ' + cy
            + ' A ' + radius + ' ' + radius + ' 0 1 1 ' + (cx - radius) + ' ' + cy
            + ' Z'
    }
    const end = pieEnd(volume, cx, cy, radius)
    const large = turn > 0.5 ? 1 : 0
    return 'M ' + cx + ' ' + cy
        + ' L ' + cx + ' ' + (cy - radius)
        + ' A ' + radius + ' ' + radius + ' 0 ' + large + ' 1 ' + end.x + ' ' + end.y
        + ' Z'
}

/** Even meter bars. 0 is a short centered tick. 1 fills the slot. */
function meterScale(rms, index) {
    const start = index * 0.018
    const span = 0.022
    const t = Math.max(0, Math.min(1, ((rms > 0 ? rms : 0) - start) / span))
    return 0.36 + 0.64 * t
}

module.exports = {
    clampVolume,
    gainFromVolume,
    volumeFromVerticalDrag,
    volumeFromPoint,
    volumeFromGesture,
    pieEnd,
    pieWedge,
    meterScale,
}
