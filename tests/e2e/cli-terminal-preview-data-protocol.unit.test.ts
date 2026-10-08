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
  'payload-pty',
  'bytes',
  'resync-extra',
  'private-field',
  'applied-proof',
  'oversized'
])('refuses invalid private preview stream payload: %s', async (mode) => {
  const root = await mkdtemp(join(tmpdir(), 'orca-preview-data-protocol-')),
    target = {
      terminal: 'term_fixture',
      expectedPtyId: 'fixture',
      expectedIncarnationId: 'fixture-incarnation',
      expectedExecutionHostId: 'local',
      expectedRendererId: 421,
      includeContent: true
    },
    close = vi.fn(),
    data = mode === 'oversized' ? 'x'.repeat(2 * 1024 * 1024 + 1) : 'private-preview-canary 한글'
  for (const key of ['ORCA_ENVIRONMENT', 'ORCA_PAIRING_CODE', 'ORCA_REMOTE_PAIRING']) {
    vi.stubEnv(key, undefined)
  }
  vi.stubEnv('ORCA_USER_DATA_PATH', root)
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(RuntimeClient.prototype, 'subscribeTerminalPreviewData').mockImplementation(
    async (_params, callbacks) => {
      const emit = (result: unknown) =>
        callbacks.onResponse({ id: 'fixture', ok: true, result, _meta: { runtimeId: 'fixture' } })
      emit({
        ...target,
        type: 'ready',
        sequence: 0,
        expectedRendererId: mode === 'ready' ? 422 : 421
      })
      emit({
        type: 'event',
        sequence: 1,
        rendererApplied: mode === 'applied-proof',
        request: {
          kind: mode === 'kind' ? 'private-preview-canary' : 'preview-data',
          ptyId: mode === 'pty' ? 'other' : 'fixture',
          rendererId: mode === 'renderer' ? 422 : 421,
          payload:
            mode === 'resync-extra'
              ? { type: 'resync', ptyId: 'fixture', data }
              : {
                  type: 'data',
                  ptyId: mode === 'payload-pty' ? 'other' : 'fixture',
                  data,
                  bytes: Buffer.byteLength(data, 'utf8') + (mode === 'bytes' ? 1 : 0),
                  ...(mode === 'private-field' ? { private: data } : {})
                }
        }
      })
      return { close }
    }
  )
  try {
    const file = join(root, 'request.json')
    await writeFile(file, JSON.stringify({ ...target, watchMs: 500 }))
    await main(['terminal', 'watch-preview-data', '--request-file', file, '--json'], root)
    expect(process.exitCode).toBe(1)
    expect(close).toHaveBeenCalledOnce()
    const frames = output.mock.calls.map((call) => JSON.parse(String(call[0])))
    expect(frames).not.toContainEqual(expect.objectContaining({ type: 'event' }))
    expect(JSON.stringify(frames)).not.toContain('private-preview-canary')
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
