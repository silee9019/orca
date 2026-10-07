import { afterEach, describe, expect, it, vi } from 'vitest'
import { RuntimeClient } from '../runtime-client'
import { VM_LIFECYCLE_HANDLERS } from './vm-lifecycle'
import { VM_LIFECYCLE_COMMAND_SPECS } from '../specs/vm-lifecycle'
afterEach(() => vi.restoreAllMocks())
const client = new RuntimeClient('/unused')
async function invoke(command: string, flags: [string, string][]) {
  const handler = VM_LIFECYCLE_HANDLERS[command]
  if (!handler) {
    throw new Error('Missing handler')
  }
  return handler({ client, flags: new Map(flags), json: true, cwd: '/unused' })
}
describe('VM lifecycle CLI results', () => {
  it('has a handler for every command and accepts exact stop confirmation', () => {
    for (const spec of VM_LIFECYCLE_COMMAND_SPECS) {
      expect(VM_LIFECYCLE_HANDLERS[spec.path.join(' ')]).toBeTypeOf('function')
    }
    expect(
      VM_LIFECYCLE_COMMAND_SPECS.find((spec) => spec.path.join(' ') === 'vm stop-cleanup')
        ?.allowedFlags
    ).toContain('confirm')
  })
  it('rejects a failed provider DTO without printing success', async () => {
    vi.spyOn(RuntimeClient.prototype, 'call').mockResolvedValue({
      id: 'fixture',
      ok: true,
      result: { ok: false, error: 'fixture_failure' },
      _meta: { runtimeId: 'fixture' }
    })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await expect(
      invoke('vm provision', [
        ['repo', 'r'],
        ['recipe', 'recipe'],
        ['provision-id', 'p']
      ])
    ).rejects.toThrow('fixture_failure')
    expect(log).not.toHaveBeenCalled()
  })
  it('rejects failed cleanup and a mismatched stop target', async () => {
    const call = vi.spyOn(RuntimeClient.prototype, 'call').mockResolvedValue({
      id: 'fixture',
      ok: true,
      result: { cleanupStatus: 'failed' },
      _meta: { runtimeId: 'fixture' }
    })
    await expect(invoke('vm cleanup', [['runtime', 'r']])).rejects.toThrow('cleanup failed')
    call.mockClear()
    await expect(
      invoke('vm stop-cleanup', [
        ['runtime', 'r'],
        ['confirm', 'other']
      ])
    ).rejects.toThrow('--confirm')
    expect(call).not.toHaveBeenCalled()
  })
})
