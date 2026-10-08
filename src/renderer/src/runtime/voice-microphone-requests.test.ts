import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cancelMicrophoneRequest,
  cancelPendingMicrophoneRequests,
  readMicrophoneRequest,
  startMicrophoneRequest
} from './voice-microphone-requests'

afterEach(() => {
  cancelPendingMicrophoneRequests()
  vi.unstubAllGlobals()
})

describe('voice microphone permission lifecycle', () => {
  it('returns pending without waiting for human permission and stops a stream granted after cancellation', async () => {
    let grant: ((stream: { getTracks(): { stop(): void }[] }) => void) | undefined
    const pending = new Promise<{ getTracks(): { stop(): void }[] }>((resolve) => {
      grant = resolve
    })
    const stop = vi.fn()
    const getUserMedia = vi.fn(() => pending)
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
    const started = startMicrophoneRequest()
    expect(started.requestState).toBe('pending')
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true })
    expect(() => startMicrophoneRequest()).toThrow('already_pending')
    expect(cancelMicrophoneRequest(started.operationId)).toMatchObject({
      requestState: 'cancelled',
      nativePending: true,
      osPromptDismissed: false
    })
    expect(() => startMicrophoneRequest()).toThrow('already_pending')
    if (!grant) {
      throw new Error('Missing fixture grant callback')
    }
    grant({ getTracks: () => [{ stop }] })
    await pending
    await Promise.resolve()
    expect(stop).toHaveBeenCalledOnce()
    expect(readMicrophoneRequest(started.operationId).requestState).toBe('cancelled')
  })
  it('reports denied without returning provider error text', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(new Error('fixture-private-detail')) }
    })
    const started = startMicrophoneRequest()
    await Promise.resolve()
    expect(readMicrophoneRequest(started.operationId)).toEqual({
      operationId: started.operationId,
      requestState: 'denied',
      nativePending: false,
      osPromptDismissed: false
    })
  })
})
