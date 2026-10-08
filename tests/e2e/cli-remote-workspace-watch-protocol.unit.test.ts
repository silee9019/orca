import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { main } from '../../src/cli/index'
import { RuntimeClient } from '../../src/cli/runtime/client'

it.each(['ready-scope', 'event-scope', 'snapshot', 'extra-frame-field'])(
  'refuses private workspace frames with an invalid identity or shape: %s',
  async (mode) => {
    const root = await mkdtemp(join(tmpdir(), 'orca-workspace-protocol-'))
    const close = vi.fn()
    for (const key of ['ORCA_ENVIRONMENT', 'ORCA_PAIRING_CODE', 'ORCA_REMOTE_PAIRING']) {
      vi.stubEnv(key, undefined)
    }
    vi.stubEnv('ORCA_USER_DATA_PATH', root)
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(RuntimeClient.prototype, 'subscribeRemoteWorkspace').mockImplementation(
      async (_params, callbacks) => {
        const emit = (result: unknown) =>
          callbacks.onResponse({ id: 'fixture', ok: true, result, _meta: { runtimeId: 'fixture' } })
        emit({
          type: 'ready',
          sequence: 0,
          targetIds: [mode === 'ready-scope' ? 'fixture-other' : 'fixture-selected']
        })
        const snapshot = {
          namespace: 'fixture',
          revision: 1,
          updatedAt: 1,
          schemaVersion: 1,
          session: {
            activeWorktreePath: null,
            activeTabId: 'private-unrequested-fixture',
            tabsByWorktreePath: {},
            terminalLayoutsByTabId: {}
          },
          ...(mode === 'snapshot' ? {} : { hostObservationToken: 'fixture-token' })
        }
        emit({
          type: 'event',
          sequence: 1,
          change: {
            targetId: mode === 'event-scope' ? 'fixture-other' : 'fixture-selected',
            snapshot
          },
          ...(mode === 'extra-frame-field'
            ? { unexpectedPrivate: 'private-unrequested-fixture' }
            : {})
        })
        return { close }
      }
    )
    try {
      const file = join(root, 'watch.json')
      await writeFile(file, JSON.stringify({ targetIds: ['fixture-selected'], watchMs: 1000 }))
      await main(['agent', 'remote-workspace', 'watch', '--request-file', file, '--json'], root)
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
