import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseArgs, validateCommandAndFlags } from '../args'
import { RuntimeClient } from '../runtime-client'
import { SEARCH_CONSENT_COMMAND_SPECS } from '../specs/search-consent'
import { SEARCH_CONSENT_HANDLERS } from './search-consent'

const client = new RuntimeClient(join(tmpdir(), 'orca-search-consent-fixture'), 60_000, null, null)
const status = {
  enabled: true,
  phase: 'current',
  filesIndexed: 1,
  filesDue: 0,
  filesFailed: 0,
  degradedRoots: [],
  lastReconcileAt: null,
  lastSweepCompletedAt: null,
  generation: 1
}
const args = [
  'search',
  'consent',
  '--host',
  'runtime:paired-one',
  '--enabled',
  'true',
  '--confirm',
  'runtime:paired-one'
]

async function run(argv = args) {
  const parsed = parseArgs(
    argv,
    SEARCH_CONSENT_COMMAND_SPECS.map((spec) => spec.path)
  )
  validateCommandAndFlags(SEARCH_CONSENT_COMMAND_SPECS, parsed)
  const handler = SEARCH_CONSENT_HANDLERS[parsed.commandPath.join(' ')]
  if (!handler) {
    throw new Error('Missing search consent handler')
  }
  await handler({ client, flags: parsed.flags, cwd: tmpdir(), json: true })
}

afterEach(() => vi.restoreAllMocks())

describe('paired session search consent', () => {
  it.each([true, false])('uses the existing consent service for enabled=%s', async (enabled) => {
    vi.spyOn(client, 'isRemote', 'get').mockReturnValue(true)
    const call = vi.spyOn(client, 'call').mockResolvedValue({
      id: 'fixture',
      ok: true,
      result: { ...status, enabled },
      _meta: { runtimeId: 'paired-one' }
    })
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    await run(args.map((value) => (value === 'true' ? String(enabled) : value)))
    expect(call).toHaveBeenCalledExactlyOnceWith('aiVault.setSearchEnabled', { enabled })
    expect(output.mock.calls.join('')).toContain('runtime:paired-one')
  })

  it.each(
    [
      args.filter((_, index) => index !== 2 && index !== 3),
      args.map((value) => (value === 'runtime:paired-one' ? 'local' : value)),
      [...args.slice(0, -1), 'runtime:other'],
      args.map((value) => (value === 'true' ? 'yes' : value))
    ].map((argv) => ({ argv }))
  )('rejects unsafe input before transport: %j', async ({ argv }) => {
    vi.spyOn(client, 'isRemote', 'get').mockReturnValue(true)
    const call = vi.spyOn(client, 'call')
    await expect(run(argv)).rejects.toThrow()
    expect(call).not.toHaveBeenCalled()
  })

  it('rejects a local connection despite a runtime-looking flag', async () => {
    const call = vi.spyOn(client, 'call')
    await expect(run()).rejects.toThrow('paired')
    expect(call).not.toHaveBeenCalled()
  })

  it.each([undefined, { ...status, enabled: false }])(
    'refuses missing or inconsistent host readback',
    async (result) => {
      vi.spyOn(client, 'isRemote', 'get').mockReturnValue(true)
      vi.spyOn(client, 'call').mockResolvedValue({
        id: 'fixture',
        ok: true,
        result,
        _meta: { runtimeId: 'paired-one' }
      })
      const output = vi.spyOn(console, 'log').mockImplementation(() => {})
      await expect(run()).rejects.toThrow()
      expect(output).not.toHaveBeenCalled()
    }
  )

  it('preserves a host permission or old-peer refusal', async () => {
    vi.spyOn(client, 'isRemote', 'get').mockReturnValue(true)
    vi.spyOn(client, 'call').mockRejectedValue(new Error('forbidden'))
    await expect(run()).rejects.toThrow('forbidden')
  })
})
