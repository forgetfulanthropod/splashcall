/**
 * Microphone options shared by the looper and the tests.
 * Echo cancellation stays off: Android will still try to cancel the mic
 * against anything the page plays out of the speaker. The capture graph
 * keeps that feed at zero and these flags ask Chrome not to add its own.
 */

function micAudioConstraints() {
    return {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
        googEchoCancellation: false,
        googNoiseSuppression: false,
        googAutoGainControl: false,
        googHighpassFilter: false,
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
