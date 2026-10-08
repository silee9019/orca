import { expect, it, vi } from 'vitest'
import {
  getPtyControlRequestObserverCount,
  publishPtyControlRequest,
  subscribePtyControlRequests
} from '../../src/main/runtime/pty-control-request-observers'
import type { PtyControlRequest } from '../../src/main/runtime/pty-control-request-observers'
it('isolates runtimes, nested options and failing readers without changing the producer', () => {
  const owner = {},
    other = {},
    first = vi.fn((event: PtyControlRequest) => {
      if ('ptyId' in event) {
        event.ptyId = 'mutated'
      }
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

it('isolates private renderer payload objects between observers', () => {
  const owner = {},
    changed = vi.fn()
  const first = subscribePtyControlRequests(
    owner,
    (request) => {
      if (request.kind === 'renderer-data') {
        request.payload.data = 'mutated'
        request.payload.id = 'other'
      }
    },
    vi.fn()
  )
  const second = subscribePtyControlRequests(owner, changed, vi.fn())
  const request = {
    kind: 'renderer-data' as const,
    ptyId: 'fixture',
    rendererId: 421,
    origin: 'pty-output' as const,
    payload: { id: 'fixture', data: 'private original output', seq: 17 }
  }
  publishPtyControlRequest(owner, request)
  expect(changed).toHaveBeenCalledWith(request)
  expect(request.payload).toEqual({ id: 'fixture', data: 'private original output', seq: 17 })
  first()
  second()
  expect(getPtyControlRequestObserverCount(owner)).toBe(0)
})
