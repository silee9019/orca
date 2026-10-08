import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { main } from '../../src/cli/index'
import { RuntimeClient } from '../../src/cli/runtime/client'

it.each([
  'ready',
  'renderer',
  'kind',
  'request-id',
  'runtime',
  'cross-protocol',
  'private-field',
  'applied-proof'
])('rejects invalid terminal renderer request or scope: %s', async (mode) => {
  const root = await mkdtemp(join(tmpdir(), 'orca-renderer-resync-protocol-'))
  const close = vi.fn()
  const target = { expectedRuntimeId: 'fixture', executionHostId: 'local', expectedRendererId: 421 }
  for (const key of ['ORCA_ENVIRONMENT', 'ORCA_PAIRING_CODE', 'ORCA_REMOTE_PAIRING']) {
    vi.stubEnv(key, undefined)
  }
  vi.stubEnv('ORCA_USER_DATA_PATH', root)
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(RuntimeClient.prototype, 'subscribeRendererDeliveryResync').mockImplementation(
    async (_params, callbacks) => {
      const emit = (result: unknown) =>
        callbacks.onResponse({ id: 'fixture', ok: true, result, _meta: { runtimeId: 'fixture' } })
      emit({
        ...target,
        type: 'ready',
        sequence: 0,
        expectedRendererId: mode === 'ready' ? 422 : target.expectedRendererId,
        expectedRuntimeId: mode === 'runtime' ? 'other' : target.expectedRuntimeId
      })
      emit({
        type: 'event',
        sequence: 1,
        rendererApplied: mode === 'applied-proof',
        request: {
          kind: mode === 'kind' ? 'private-unrequested-fixture' : 'delivery-resync',
          rendererId: mode === 'renderer' ? 422 : 421,
          requestId: mode === 'request-id' ? -1 : 17,
          ...(mode === 'private-field' ? { bufferText: 'private-unrequested-fixture' } : {}),
          ...(mode === 'cross-protocol' ? { ptyId: 'private-unrequested-fixture' } : {})
        }
      })
      return { close }
    }
  )
  try {
    const file = join(root, 'watch.json')
    await writeFile(file, JSON.stringify({ ...target, watchMs: 1000 }))
    await main(['terminal', 'watch-delivery-resync', '--request-file', file, '--json'], root)
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
