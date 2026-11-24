export function rmsOf(samples: ArrayLike<number> | null | undefined): number
export function peakOf(samples: ArrayLike<number> | null | undefined): number
export function makeup(samples: Float32Array): Float32Array
export function peaksPerPixel(samples: ArrayLike<number> | null | undefined, pixels: number): Float32Array
export function waveformHasEnergy(peaks: ArrayLike<number> | null | undefined): boolean
export function testVoice(sampleRate: number, seconds?: number): Float32Array
export function drawWaveform(canvas: HTMLCanvasElement, peaks: ArrayLike<number> | null | undefined, color?: string): void
export function drawLane(
    canvas: HTMLCanvasElement,
    peaks: ArrayLike<number> | null | undefined,
    songBars: number,
    startBar: number,
    endBar: number,
    loopBars: number | 'free',
): void
