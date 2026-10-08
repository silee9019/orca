import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { main } from '../../src/cli/index'
import { RuntimeClient } from '../../src/cli/runtime/client'

it.each(['ready-scope', 'set-scope', 'clear-scope', 'disconnect-scope', 'private-field'])(
  'refuses status frames with an invalid scope or private fields: %s',
  async (mode) => {
    const root = await mkdtemp(join(tmpdir(), 'orca-status-protocol-'))
    const close = vi.fn()
    for (const key of ['ORCA_ENVIRONMENT', 'ORCA_PAIRING_CODE', 'ORCA_REMOTE_PAIRING']) {
      vi.stubEnv(key, undefined)
    }
    vi.stubEnv('ORCA_USER_DATA_PATH', root)
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(RuntimeClient.prototype, 'subscribeAgentStatus').mockImplementation(
      async (_params, callbacks) => {
        const emit = (result: unknown) =>
          callbacks.onResponse({ id: 'fixture', ok: true, result, _meta: { runtimeId: 'fixture' } })
        const paneKey = 'watch-tab:11111111-1111-4111-8111-111111111111'
        const otherPane = 'other-tab:22222222-2222-4222-8222-222222222222'
        emit({
          type: 'ready',
          sequence: 0,
          paneKeys: [mode === 'ready-scope' ? otherPane : paneKey],
          connectionIds: ['fixture-ssh']
        })
        if (mode === 'clear-scope') {
          emit({ type: 'event', sequence: 1, kind: 'clear', clear: { paneKey: otherPane } })
        } else if (mode === 'disconnect-scope') {
          emit({
            type: 'event',
            sequence: 1,
            kind: 'clear',
            clear: { transient: true, connectionId: 'other-ssh', clearedAt: 1 }
          })
        } else {
          emit({
            type: 'event',
            sequence: 1,
            kind: 'set',
            status: {
              paneKey: mode === 'set-scope' ? otherPane : paneKey,
              state: 'working',
              agentType: 'claude',
              connectionId: null,
              receivedAt: 1,
              stateStartedAt: 1,
              ...(mode === 'private-field' ? { prompt: 'private-unrequested-fixture' } : {})
            }
          })
        }
        return { close }
      }
    )
    try {
      const file = join(root, 'watch.json')
      await writeFile(
        file,
        JSON.stringify({
          watchMs: 1000,
          paneKeys: ['watch-tab:11111111-1111-4111-8111-111111111111'],
          connectionIds: ['fixture-ssh']
        })
      )
      await main(['agent', 'status', 'watch', '--request-file', file, '--json'], root)
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
