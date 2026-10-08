import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { RuntimeClient } from './runtime-client'
import { okFixture } from './test-fixtures'
import { BROWSER_IMPORT_HINT_HANDLERS } from './handlers/browser-import-hint'
const profiles: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(
    profiles.splice(0).map((profile) => rm(profile, { recursive: true, force: true }))
  )
})
const publicState = {
  open: false,
  menuOpen: false,
  detectionSettled: false,
  settingsOpened: false,
  hidden: false
}
async function readReply(result: unknown): Promise<string> {
  const profile = await mkdtemp(join(tmpdir(), 'orca-import-hint-reply-'))
  profiles.push(profile)
  const client = new RuntimeClient(profile, 1000, null, null)
  const response = {
    ...okFixture('reply', result),
    privateEnvelope: 'private-envelope',
    _meta: { runtimeId: 'runtime-1', privateMetadata: 'private-meta' }
  }
  vi.spyOn(client, 'call').mockResolvedValue(response)
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  await BROWSER_IMPORT_HINT_HANDLERS['browser import-hint']({
    flags: new Map([
      ['viewer', 'host'],
      ['host', 'local'],
      ['page', 'page'],
      ['profile', 'default'],
      ['action', 'status']
    ]),
    client,
    cwd: profile,
    json: true
  })
  return output.mock.calls.map((call) => call.join(' ')).join('\n')
}
it('projects only public envelope and nested import hint fields', async () => {
  const output = await readReply({
    applied: true,
    browserImportHint: { ...publicState, privateProvider: 'private-state' },
    privateResult: 'private-result',
    command: 'private-command'
  })
  expect(JSON.parse(output)).toEqual({
    id: 'reply',
    ok: true,
    _meta: { runtimeId: 'runtime-1' },
    result: { applied: true, browserImportHint: publicState }
  })
  expect(output).not.toContain('private-')
})
it.each([
  null,
  undefined,
  {},
  { applied: false, browserImportHint: publicState },
  { applied: true, browserImportHint: null },
  { applied: true, browserImportHint: { private: true } }
])('rejects malformed or unacknowledged result without output: %j', async (result) => {
  await expect(readReply(result)).rejects.toMatchObject({ code: 'runtime_error' })
  expect(vi.mocked(console.log)).not.toHaveBeenCalled()
})

it('accepts an older public status reply without the optional hidden field', async () => {
  const output = await readReply({
    applied: true,
    browserImportHint: {
      open: false,
      menuOpen: false,
      detectionSettled: false,
      settingsOpened: false
    }
  })
  expect(JSON.parse(output).result.browserImportHint).toEqual({
    open: false,
    menuOpen: false,
    detectionSettled: false,
    settingsOpened: false
  })
})
