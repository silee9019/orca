import { expect, it, vi } from 'vitest'
import {
  subscribeLegacyWorkerRecovery,
  publishLegacyWorkerRecovery,
  getLegacyWorkerRecoveryObserverCount
} from '../../src/main/runtime/legacy-worker-recovery-observers'

it('isolates runtime owners and observer failures while preserving the canonical UI notifier', () => {
  const owner = {},
    otherOwner = {},
    healthy = vi.fn(),
    wrongHost = vi.fn(),
    notify = vi.fn()
  const stopBad = subscribeLegacyWorkerRecovery(
    owner,
    () => {
      throw new Error('fixture reader')
    },
    () => {
      throw new Error('fixture cleanup')
    }
  )
  const stopHealthy = subscribeLegacyWorkerRecovery(owner, healthy, () => {})
  const stopOther = subscribeLegacyWorkerRecovery(otherOwner, wrongHost, () => {})
  const event = {
    paneKey: 'fixture:11111111-1111-4111-8111-111111111111',
    resolution: 'adopted' as const
  }
  try {
    expect(() =>
      publishLegacyWorkerRecovery(owner, { resolveLegacyWorkerTerminalRecovery: notify }, event)
    ).not.toThrow()
    expect(healthy).toHaveBeenCalledOnce()
    expect(wrongHost).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledExactlyOnceWith(event.paneKey, 'adopted')
    expect(getLegacyWorkerRecoveryObserverCount(owner)).toBe(1)
    publishLegacyWorkerRecovery(
      owner,
      { resolveLegacyWorkerTerminalRecovery: notify },
      { ...event, resolution: 'rolled_back', ptyId: 'fixture-pty' }
    )
    expect(notify).toHaveBeenLastCalledWith(event.paneKey, 'rolled_back', 'fixture-pty')
  } finally {
    stopBad()
    stopHealthy()
    stopOther()
  }
  expect(getLegacyWorkerRecoveryObserverCount(owner)).toBe(0)
  expect(getLegacyWorkerRecoveryObserverCount(otherOwner)).toBe(0)
})
