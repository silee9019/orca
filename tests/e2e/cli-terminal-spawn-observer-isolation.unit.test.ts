import { expect, it, vi } from 'vitest'
import {
  getPtySpawnObserverCount,
  publishPtySpawned,
  subscribePtySpawned
} from '../../src/main/runtime/pty-spawn-observers'

it('isolates owners and readers and removes failing observers without changing the producer', () => {
  const owner = {},
    other = {},
    first = vi.fn((event) => {
      event.ptyId = 'mutated'
    }),
    second = vi.fn(),
    foreign = vi.fn()
  const failed = vi.fn(() => {
    throw new Error('fixture cleanup failure')
  })
  const dispose = subscribePtySpawned(owner, first, vi.fn())
  const disposeSecond = subscribePtySpawned(owner, second, vi.fn())
  const disposeForeign = subscribePtySpawned(other, foreign, vi.fn())
  subscribePtySpawned(
    owner,
    () => {
      throw new Error('fixture reader failure')
    },
    failed
  )
  expect(() => publishPtySpawned(owner, 'fixture', 'incarnation', true)).not.toThrow()
  expect(second).toHaveBeenCalledWith({
    ptyId: 'fixture',
    incarnationId: 'incarnation',
    executionHostId: 'local',
    awaitsRegistration: true
  })
  expect(foreign).not.toHaveBeenCalled()
  expect(failed).toHaveBeenCalledOnce()
  expect(getPtySpawnObserverCount(owner)).toBe(2)
  for (const ptyId of ['ssh:malformed', 'remote:malformed']) {
    publishPtySpawned(owner, ptyId, undefined, false)
  }
  expect(second).toHaveBeenCalledOnce()
  dispose()
  dispose()
  disposeSecond()
  disposeForeign()
  expect(getPtySpawnObserverCount(owner)).toBe(0)
  expect(getPtySpawnObserverCount(other)).toBe(0)
})
