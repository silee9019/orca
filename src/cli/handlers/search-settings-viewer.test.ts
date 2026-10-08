import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { RuntimeClient } from '../runtime-client'
import { SEARCH_SETTINGS_VIEWER_HANDLERS } from './search-settings-viewer'

const client = new RuntimeClient(join(tmpdir(), 'orca-search-viewer-guard'), 5000, null, null)
const handler = SEARCH_SETTINGS_VIEWER_HANDLERS['search viewer']
async function run(flags: Record<string, string>) {
  if (!handler) {
    throw new Error('Missing viewer handler')
  }
  await handler({ client, flags: new Map(Object.entries(flags)), cwd: tmpdir(), json: true })
}
afterEach(() => vi.restoreAllMocks())

const invalidTargets: Record<string, string>[] = [
  { viewer: 'other', operation: 'list-toggle' },
  { viewer: 'host', operation: 'local-toggle' },
  { viewer: 'host', operation: 'enable-all', confirm: 'local' },
  { viewer: 'host', operation: 'server-toggle', 'target-host': 'local', confirm: 'local' },
  {
    viewer: 'host',
    operation: 'server-toggle',
    'target-host': 'runtime:one',
    confirm: 'runtime:two'
  }
]
it.each(invalidTargets)(
  'rejects invalid viewer/consent targets before transport: %j',
  async (flags) => {
    const call = vi.spyOn(client, 'call')
    await expect(run(flags)).rejects.toThrow()
    expect(call).not.toHaveBeenCalled()
  }
)

it.each([
  { applied: false, persisted: false },
  { applied: true, persisted: false }
])('refuses incomplete local consent acknowledgements: %j', async (result) => {
  vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'fixture' },
    result: { viewer: 'host', viewerId: 7, ...result }
  })
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  await expect(
    run({ viewer: 'host', operation: 'local-toggle', confirm: 'local' })
  ).rejects.toThrow()
  expect(output).not.toHaveBeenCalled()
})

it('prints a validated acknowledgement after the exact viewer command is sent', async () => {
  const call = vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'fixture' },
    result: { viewer: 'host', viewerId: 7, applied: true, persisted: true, enabled: true }
  })
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  await run({ viewer: 'host', operation: 'local-toggle', confirm: 'local' })
  expect(call).toHaveBeenCalledExactlyOnceWith('search.viewer', {
    viewer: 'host',
    operation: 'local-toggle',
    confirmation: 'local'
  })
  expect(output.mock.calls.at(-1)?.[0]).toContain('"persisted": true')
})
