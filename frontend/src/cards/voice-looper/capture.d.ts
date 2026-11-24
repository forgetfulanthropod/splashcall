export function micAudioConstraints(): {
    echoCancellation: boolean
    noiseSuppression: boolean
    autoGainControl: boolean
}
export function needsAudioResume(state: string): boolean
export function dbFromRms(rms: number): number
