import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { RuntimeClient } from './runtime-client'
import { okFixture } from './test-fixtures'
import { BROWSER_SETUP_GUIDE_HANDLERS } from './handlers/browser-setup-guide'
const profiles: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(
    profiles.splice(0).map((profile) => rm(profile, { recursive: true, force: true }))
  )
})
const publicState = {
  busy: false,
  commandPrepared: false,
  browserUseEnabled: true,
  orchestrationEnabled: false,
  interactionRecorded: false
}
async function readReply(result: unknown): Promise<string> {
  const profile = await mkdtemp(join(tmpdir(), 'orca-setup-guide-reply-'))
  profiles.push(profile)
  const client = new RuntimeClient(profile, 1000, null, null)
  const response = {
    ...okFixture('reply', result),
    privateEnvelope: 'private-envelope',
    _meta: { runtimeId: 'runtime-1', privateMetadata: 'private-meta' }
  }
  vi.spyOn(client, 'call').mockResolvedValue(response)
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  await BROWSER_SETUP_GUIDE_HANDLERS['browser setup-guide']({
    flags: new Map([
      ['viewer', 'host'],
      ['surface', 'modal'],
      ['runtime', 'local'],
      ['workspace', 'none'],
      ['action', 'status']
    ]),
    client,
    cwd: profile,
    json: true
  })
  return output.mock.calls.map((call) => call.join(' ')).join('\n')
}
it('projects only public envelope and nested setup guide fields', async () => {
  const output = await readReply({
    applied: true,
    browserSetupGuide: { ...publicState, privateProvider: 'private-state' },
    privateResult: 'private-result',
    command: 'private-command'
  })
  expect(JSON.parse(output)).toEqual({
    id: 'reply',
    ok: true,
    _meta: { runtimeId: 'runtime-1' },
    result: { applied: true, browserSetupGuide: publicState }
  })
  expect(output).not.toContain('private-')
})
it.each([
  null,
  undefined,
  {},
  { applied: false, browserSetupGuide: publicState },
  { applied: true, browserSetupGuide: null },
  {
    applied: true,
    browserSetupGuide: {
      busy: false,
      browserUseEnabled: true,
      orchestrationEnabled: false,
      interactionRecorded: false
    }
  },
  { applied: true, browserSetupGuide: { private: true } }
])('rejects malformed or unacknowledged result without output: %j', async (result) => {
  await expect(readReply(result)).rejects.toMatchObject({ code: 'runtime_error' })
  expect(vi.mocked(console.log)).not.toHaveBeenCalled()
})
