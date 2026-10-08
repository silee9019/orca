import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { main } from '../../src/cli/index'
import { RuntimeClient } from '../../src/cli/runtime/client'

it.each([
  'ready',
  'pty',
  'renderer',
  'kind',
  'request-id',
  'opts',
  'private-field',
  'applied-proof'
])('rejects invalid terminal renderer request or scope: %s', async (mode) => {
  const root = await mkdtemp(join(tmpdir(), 'orca-control-protocol-'))
  const close = vi.fn()
  const target = {
    terminal: 'term_fixture',
    expectedPtyId: 'fixture',
    expectedIncarnationId: 'incarnation',
    expectedExecutionHostId: 'local',
    expectedRendererId: 421
  }
  for (const key of ['ORCA_ENVIRONMENT', 'ORCA_PAIRING_CODE', 'ORCA_REMOTE_PAIRING']) {
    vi.stubEnv(key, undefined)
  }
  vi.stubEnv('ORCA_USER_DATA_PATH', root)
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(RuntimeClient.prototype, 'subscribeTerminalControlRequests').mockImplementation(
    async (_params, callbacks) => {
      const emit = (result: unknown) =>
        callbacks.onResponse({ id: 'fixture', ok: true, result, _meta: { runtimeId: 'fixture' } })
      emit({
        ...target,
        type: 'ready',
        sequence: 0,
        expectedRendererId: mode === 'ready' ? 422 : target.expectedRendererId
      })
      emit({
        type: 'event',
        sequence: 1,
        rendererApplied: mode === 'applied-proof',
        request: {
          kind: mode === 'kind' ? 'private-unrequested-fixture' : 'serialize-buffer',
          ptyId: mode === 'pty' ? 'other' : target.expectedPtyId,
          rendererId: mode === 'renderer' ? 422 : 421,
          requestId: mode === 'request-id' ? 'invalid' : '11111111-1111-4111-8111-111111111111',
          opts: { scrollbackRows: mode === 'opts' ? -1 : 17 },
          ...(mode === 'private-field' ? { bufferText: 'private-unrequested-fixture' } : {})
        }
      })
      return { close }
    }
  )
  try {
    const file = join(root, 'watch.json')
    await writeFile(file, JSON.stringify({ ...target, watchMs: 1000 }))
    await main(['terminal', 'watch-control-requests', '--request-file', file, '--json'], root)
    expect(process.exitCode).toBe(1)
    expect(close).toHaveBeenCalledOnce()
    const frames = output.mock.calls.map((call) => JSON.parse(String(call[0])))
    expect(frames).not.toContainEqual(expect.objectContaining({ type: 'event' }))
    expect(JSON.stringify(frames)).not.toContain('private-unrequested-fixture')
    expect(frames).toContainEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: 'invalid_runtime_response' })
      })
    )
  } finally {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    process.exitCode = undefined
    await rm(root, { recursive: true, force: true })
  }
})
