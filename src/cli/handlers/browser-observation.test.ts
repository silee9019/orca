import { afterEach, expect, it, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { RuntimeClient } from '../runtime-client'
import { parseArgs, validateCommandAndFlags } from '../args'
import { BROWSER_OBSERVATION_COMMAND_SPECS } from '../specs/browser-observation'
import { BROWSER_OBSERVATION_HANDLERS } from './browser-observation'
const client = new RuntimeClient(tmpdir())
afterEach(() => vi.restoreAllMocks())
async function run(json: boolean) {
  const specs = BROWSER_OBSERVATION_COMMAND_SPECS
  const parsed = parseArgs(
    [
      'runtime',
      'browser-observe',
      '--viewer',
      'host',
      '--page',
      'page',
      '--worktree',
      'folder:fixture'
    ],
    specs.map((spec) => spec.path),
    specs
  )
  validateCommandAndFlags(specs, parsed)
  await BROWSER_OBSERVATION_HANDLERS['runtime browser-observe']({
    ...parsed,
    client,
    cwd: tmpdir(),
    json
  })
}
const observation = {
  kind: 'driver',
  page: 'page',
  worktreeId: 'folder:fixture',
  changed: false,
  driver: { kind: 'desktop' }
}
it.each([false, true])('projects only public receipt fields json=%s', async (json) => {
  const meta = { runtimeId: 'fixture', privateToken: 'META_PRIVATE' }
  vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: meta,
    result: {
      applied: true,
      page: 'page',
      privateToken: 'RESULT_PRIVATE',
      observation: {
        ...observation,
        privateToken: 'RECEIPT_PRIVATE',
        driver: { kind: 'desktop', privateToken: 'DRIVER_PRIVATE' }
      }
    }
  })
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  await run(json)
  expect(output.mock.lastCall?.[0]).toContain('"kind": "desktop"')
  expect(output.mock.lastCall?.[0]).not.toContain('PRIVATE')
})
it.each([
  undefined,
  { ...observation, changed: 'yes' },
  { ...observation, page: 'other' },
  { ...observation, driver: { kind: 'mobile' } }
])('rejects malformed receipts and emits nothing %j', async (value) => {
  vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'fixture' },
    result: { applied: true, page: 'page', observation: value }
  })
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  await expect(run(true)).rejects.toMatchObject({ code: 'runtime_error' })
  expect(output).not.toHaveBeenCalled()
})
it('reports future driver kinds as unsupported without falling back to idle or printing their payload', async () => {
  vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'fixture' },
    result: {
      applied: true,
      page: 'page',
      observation: { ...observation, driver: { kind: 'future-kind', privateToken: 'PRIVATE' } }
    }
  })
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  await expect(run(true)).rejects.toMatchObject({ code: 'incompatible_runtime' })
  expect(output).not.toHaveBeenCalled()
})
