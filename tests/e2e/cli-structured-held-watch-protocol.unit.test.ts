import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { main } from '../../src/cli/index'
import { RuntimeClient } from '../../src/cli/runtime/client'

it.each(['bad-held', 'extra-frame-field', 'sequence', 'duplicate-ready'])(
  'refuses held frames with invalid shape or sequence: %s',
  async (mode) => {
    const root = await mkdtemp(join(tmpdir(), 'orca-held-protocol-'))
    const close = vi.fn()
    for (const key of ['ORCA_ENVIRONMENT', 'ORCA_PAIRING_CODE', 'ORCA_REMOTE_PAIRING']) {
      vi.stubEnv(key, undefined)
    }
    vi.stubEnv('ORCA_USER_DATA_PATH', root)
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(RuntimeClient.prototype, 'subscribeStructuredHeld').mockImplementation(
      async (_params, callbacks) => {
        const emit = (result: unknown) =>
          callbacks.onResponse({ id: 'fixture', ok: true, result, _meta: { runtimeId: 'fixture' } })
        emit({ type: 'ready', sequence: 0 })
        if (mode === 'duplicate-ready') {
          emit({ type: 'ready', sequence: 0 })
        }
        emit({
          type: 'event',
          sequence: mode === 'sequence' ? 2 : 1,
          held: mode === 'bad-held' ? 'private-unrequested-fixture' : true,
          ...(mode === 'extra-frame-field'
            ? { unexpectedPrivate: 'private-unrequested-fixture' }
            : {})
        })
        return { close }
      }
    )
    try {
      const file = join(root, 'watch.json')
      await writeFile(file, JSON.stringify({ watchMs: 1000 }))
      await main(['agent', 'session', 'watch-held', '--request-file', file, '--json'], root)
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
  }
)
