import { afterEach, expect, it, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { RuntimeClient } from '../runtime-client'
import { parseArgs, validateCommandAndFlags } from '../args'
import { BROWSER_READER_COMMAND_SPECS } from '../specs/browser-readers'
import { BROWSER_READER_HANDLERS } from './browser-readers'
const client = new RuntimeClient(tmpdir())
afterEach(() => vi.restoreAllMocks())
async function run(command: 'browser-drivers' | 'client-browser-rows', json: boolean) {
  const specs = BROWSER_READER_COMMAND_SPECS
  const parsed = parseArgs(
    ['runtime', command],
    specs.map((spec) => spec.path),
    specs
  )
  validateCommandAndFlags(specs, parsed)
  await BROWSER_READER_HANDLERS[`runtime ${command}`]({ ...parsed, client, cwd: tmpdir(), json })
}
const row = {
  browserPageId: 'page',
  worktreeId: 'folder:fixture',
  url: 'https://kagi.com/search?token=FIXTURE_SECRET&q=orca',
  title: 'https://kagi.com/search?token=FIXTURE_SECRET&q=orca',
  loading: false,
  browserHostClientId: 'fixture-client',
  hostDeviceName: null,
  hostAbsent: true,
  lease: 'PRIVATE_LEASE',
  browserHostGeneration: 8
}
it.each([false, true])(
  'projects both complete readers without private fields json=%s',
  async (json) => {
    const meta = { runtimeId: 'fixture', secret: 'PRIVATE_META' }
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(client, 'call').mockResolvedValue({
      id: 'fixture',
      ok: true,
      _meta: meta,
      result: [
        {
          browserPageId: 'page',
          driver: { kind: 'mobile', clientId: 'fixture-client', secret: 'PRIVATE_DRIVER' },
          secret: 'PRIVATE_ROW'
        }
      ]
    })
    await run('browser-drivers', json)
    expect(output.mock.lastCall?.[0]).toContain('fixture-client')
    expect(output.mock.lastCall?.[0]).not.toContain('PRIVATE')
    vi.mocked(client.call).mockResolvedValue({
      id: 'fixture',
      ok: true,
      _meta: meta,
      result: [{ worktreeId: 'folder:fixture', rows: [row], secret: 'PRIVATE_GROUP' }]
    })
    await run('client-browser-rows', json)
    expect(output.mock.lastCall?.[0]).toContain('q=orca')
    expect(output.mock.lastCall?.[0]).not.toContain('FIXTURE_SECRET')
    expect(output.mock.lastCall?.[0]).not.toContain('PRIVATE')
    expect(output.mock.lastCall?.[0]).not.toContain('browserHostGeneration')
  }
)
it.each([undefined, null, {}, [{ browserPageId: 'page', driver: { kind: 'mobile' } }]])(
  'rejects malformed complete snapshots %j',
  async (result) => {
    vi.spyOn(client, 'call').mockResolvedValue({
      id: 'fixture',
      ok: true,
      _meta: { runtimeId: 'fixture' },
      result
    })
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    await expect(run('browser-drivers', true)).rejects.toMatchObject({ code: 'runtime_error' })
    await expect(run('client-browser-rows', true)).rejects.toMatchObject({ code: 'runtime_error' })
    expect(output).not.toHaveBeenCalled()
  }
)
it('reports a future driver kind as unsupported rather than idle', async () => {
  vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'fixture' },
    result: [{ browserPageId: 'page', driver: { kind: 'future', secret: 'PRIVATE' } }]
  })
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  await expect(run('browser-drivers', true)).rejects.toMatchObject({ code: 'incompatible_runtime' })
  expect(output).not.toHaveBeenCalled()
})
