export function micAudioConstraints(): {
    echoCancellation: boolean
    noiseSuppression: boolean
    autoGainControl: boolean
    channelCount: number
    googEchoCancellation: boolean
    googNoiseSuppression: boolean
    googAutoGainControl: boolean
    googHighpassFilter: boolean
}
export function needsAudioResume(state: string): boolean
export function dbFromRms(rms: number): number
