import { expect, it, vi } from 'vitest'
import {
  getPtyControlRequestObserverCount,
  publishPtyControlRequest,
  subscribePtyControlRequests
} from '../../src/main/runtime/pty-control-request-observers'
import type { TerminalControlRequestSignal } from '../../src/shared/rpc-contract/terminal-control-watch-params'
it('isolates runtimes, nested options and failing readers without changing the producer', () => {
  const owner = {},
    other = {},
    first = vi.fn((event: TerminalControlRequestSignal) => {
      event.ptyId = 'mutated'
      if (event.kind === 'serialize-buffer' && event.opts) {
        event.opts.scrollbackRows = 999
      }
    }),
    second = vi.fn(),
    foreign = vi.fn(),
    failed = vi.fn(() => {
      throw new Error('Fixture cleanup failure')
    })
  const dispose = subscribePtyControlRequests(owner, first, vi.fn()),
    disposeSecond = subscribePtyControlRequests(owner, second, vi.fn()),
    disposeForeign = subscribePtyControlRequests(other, foreign, vi.fn())
  subscribePtyControlRequests(
    owner,
    () => {
      throw new Error('Fixture observer failure')
    },
    failed
  )
  const request = {
    kind: 'serialize-buffer' as const,
    ptyId: 'fixture',
    rendererId: 421,
    requestId: '11111111-1111-4111-8111-111111111111',
    opts: { scrollbackRows: 17 }
  }
  expect(() => publishPtyControlRequest(owner, request)).not.toThrow()
  expect(second).toHaveBeenCalledWith(request)
  expect(request.ptyId).toBe('fixture')
  expect(request.opts.scrollbackRows).toBe(17)
  expect(foreign).not.toHaveBeenCalled()
  expect(failed).toHaveBeenCalledOnce()
  expect(getPtyControlRequestObserverCount(owner)).toBe(2)
  publishPtyControlRequest(undefined, request)
  expect(second).toHaveBeenCalledOnce()
  dispose()
  dispose()
  disposeSecond()
  disposeForeign()
  expect(getPtyControlRequestObserverCount(owner)).toBe(0)
  expect(getPtyControlRequestObserverCount(other)).toBe(0)
})
