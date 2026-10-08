import { afterEach, expect, it, vi } from 'vitest'
import { okFixture } from './test-fixtures'
import { RuntimeClient } from './runtime-client'
import { VOICE_VIEWER_HANDLERS } from './handlers/voice-viewer'
import { tmpdir } from 'node:os'

const client = new RuntimeClient(tmpdir(), 1000, null, null)
const reply = {
  id: 'menu',
  ok: true as const,
  _meta: { runtimeId: 'fixture', private: 'hidden-meta' },
  private: 'hidden-envelope',
  result: {
    viewer: 'host',
    viewerId: 1,
    applied: true,
    persisted: false,
    modelMenuOpen: true,
    private: 'hidden-result'
  }
}
afterEach(() => vi.restoreAllMocks())
async function run() {
  await VOICE_VIEWER_HANDLERS['speech viewer']({
    client,
    flags: new Map([
      ['viewer', 'host'],
      ['operation', 'model-menu-open']
    ]),
    cwd: tmpdir(),
    json: true
  })
}
it('projects only the known public menu acknowledgment', async () => {
  vi.spyOn(client, 'call').mockResolvedValue(reply)
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  await run()
  const output = log.mock.calls.flat().join(' ')
  expect(output).not.toContain('hidden-')
  expect(JSON.parse(output).result.modelMenuOpen).toBe(true)
})
it.each([
  null,
  undefined,
  {},
  null,
  { ...reply.result, modelMenuOpen: undefined },
  { ...reply.result, modelMenuOpen: false },
  { ...reply.result, applied: false }
])('rejects malformed or contradictory menu acknowledgment %j', async (value) => {
  vi.spyOn(client, 'call').mockResolvedValue(okFixture('menu', value))
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  await expect(run()).rejects.toMatchObject({ code: 'runtime_error' })
  expect(log).not.toHaveBeenCalled()
})
