import { afterEach, expect, it, vi } from 'vitest'
import { AUTOMATION_HANDLERS } from './automations'
import { RuntimeClient } from '../runtime-client'

function fixture() {
  const client = new RuntimeClient('/unused-automation-completion-fixture')
  const call = vi.spyOn(client, 'call').mockResolvedValue({
    id: 'completion',
    ok: true,
    result: { automation: { id: 'a1' }, runs: [], nextCursor: 'next' },
    _meta: { runtimeId: 'fixture' }
  })
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  return { client, call, log, cwd: '/folder', json: true }
}
afterEach(() => vi.restoreAllMocks())

it('keeps setup decisions in the owner-fenced update', async () => {
  const ctx = fixture()
  await AUTOMATION_HANDLERS['automations edit']!({
    ...ctx,
    flags: new Map([
      ['id', 'a1'],
      ['setup-decision', 'skip']
    ])
  })
  expect(ctx.call).toHaveBeenLastCalledWith('automation.update', {
    id: 'a1',
    updates: expect.objectContaining({ setupDecision: 'skip' })
  })
})

it.each(['automations create', 'automations edit'])(
  'rejects invalid setup choice before any %s RPC',
  async (command) => {
    const ctx = fixture()
    await expect(
      AUTOMATION_HANDLERS[command]!({
        ...ctx,
        flags: new Map([['setup-decision', 'unexpected']])
      })
    ).rejects.toThrow(/setup-decision/)
    expect(ctx.call).not.toHaveBeenCalled()
  }
)

it('requests a bounded run page and prints its next cursor', async () => {
  const ctx = fixture()
  await AUTOMATION_HANDLERS['automations runs']!({
    ...ctx,
    json: false,
    flags: new Map([
      ['id', 'a1'],
      ['limit', '25'],
      ['cursor', 'previous']
    ])
  })
  expect(ctx.call).toHaveBeenCalledExactlyOnceWith('automation.runsPage', {
    automationId: 'a1',
    limit: 25,
    cursor: 'previous'
  })
  expect(ctx.log).toHaveBeenCalledWith(
    expect.stringContaining('More runs: --limit 25 --cursor next')
  )
})

it('preserves an old-host pagination refusal without retrying an unbounded read', async () => {
  const ctx = fixture()
  const unsupported = new Error('method_not_found: automation.runsPage')
  ctx.call.mockRejectedValueOnce(unsupported)
  await expect(
    AUTOMATION_HANDLERS['automations runs']!({
      ...ctx,
      flags: new Map([['limit', '25']])
    })
  ).rejects.toBe(unsupported)
  expect(ctx.call).toHaveBeenCalledExactlyOnceWith('automation.runsPage', {
    automationId: undefined,
    limit: 25
  })
})
