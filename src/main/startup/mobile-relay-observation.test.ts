import { beforeEach, expect, it, vi } from 'vitest'
import type { MobileRelayObservation } from '../../shared/mobile-relay-observation'
import { getDesktopRelayStatus, publishDesktopRelayStatus } from './main-process-relay-status'
const { publish } = vi.hoisted(() => ({
  publish: vi.fn<(value: MobileRelayObservation) => void>()
}))
vi.mock('./main-process-state', () => ({
  mainProcessState: {
    desktopRelayStatus: 'offline',
    desktopRelayCellUrl: undefined,
    runtime: { notifyMobileRelayObservation: publish },
    mainWindow: null
  }
}))
beforeEach(() => publish.mockClear())
it('publishes committed canonical relay status headlessly while preserving private GUI detail', () => {
  publishDesktopRelayStatus('registered', 'private-cell-canary')
  expect(getDesktopRelayStatus()).toEqual({ status: 'registered', cellUrl: 'private-cell-canary' })
  expect(publish).toHaveBeenCalledExactlyOnceWith({ status: 'registered' })
  publishDesktopRelayStatus('offline')
  expect(getDesktopRelayStatus()).toEqual({ status: 'offline' })
  expect(publish).toHaveBeenLastCalledWith({ status: 'offline' })
  expect(JSON.stringify(publish.mock.calls)).not.toContain('private-')
})
