/**
 * Microphone options shared by the looper and the tests.
 * Echo cancellation is off on purpose: the looper plays the take back
 * through the speakers while it records, and cancellation deletes the voice.
 */

function micAudioConstraints() {
    return {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
    }
}

function needsAudioResume(state) {
    return state !== 'running'
}

function dbFromRms(rms) {
    if (!(rms > 0)) return -96
    const db = 20 * Math.log(rms) / Math.LN10
    if (db < -96) return -96
    if (db > 0) return 0
    return db
}

module.exports = {
    micAudioConstraints,
    needsAudioResume,
    dbFromRms,
}
