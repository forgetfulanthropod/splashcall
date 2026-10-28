export const mockOn = jest.fn().mockImplementation((event, callback) => { console.log('nuffin'); callback() }) //TODO: DOESN'T GET CALLED!
export const mockDestroy = jest.fn()
export const mockDisconnect = jest.fn()

export default function () {
    return {
        on: mockOn,
        destroy: mockDestroy,
        disconnect: mockDisconnect,
    }
}
