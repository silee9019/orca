import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { main } from '../../src/cli/index'
import { RuntimeClient } from '../../src/cli/runtime/client'

it.each(['ready', 'pty', 'incarnation', 'host', 'private-field', 'cause', 'foreign-live'])(
  'rejects invalid terminal exit metadata or scope: %s',
  async (mode) => {
    const root = await mkdtemp(join(tmpdir(), 'orca-exit-protocol-'))
    const close = vi.fn()
    const target = {
      terminal: 'term_fixture',
      expectedPtyId: 'fixture',
      expectedIncarnationId: 'incarnation',
      expectedExecutionHostId: 'local'
    }
    for (const key of ['ORCA_ENVIRONMENT', 'ORCA_PAIRING_CODE', 'ORCA_REMOTE_PAIRING']) {
      vi.stubEnv(key, undefined)
    }
    vi.stubEnv('ORCA_USER_DATA_PATH', root)
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(RuntimeClient.prototype, 'subscribeTerminalExit').mockImplementation(
      async (_params, callbacks) => {
        const emit = (result: unknown) =>
          callbacks.onResponse({ id: 'fixture', ok: true, result, _meta: { runtimeId: 'fixture' } })
        emit({
          ...target,
          type: 'ready',
          sequence: 0,
          expectedPtyId: mode === 'ready' ? 'other' : target.expectedPtyId
        })
        emit({
          type: 'event',
          sequence: 1,
          observation: {
            ptyId: mode === 'pty' ? 'other' : target.expectedPtyId,
            incarnationId: mode === 'incarnation' ? 'other' : target.expectedIncarnationId,
            executionHostId: mode === 'host' ? 'ssh:other' : 'local',
            code: 0,
            cause:
              mode === 'cause'
                ? { kind: 'unknown', reason: 'private-unrequested-fixture' }
                : { kind: 'unknown', reason: 'cause_unreported' },
            verdict:
              mode === 'foreign-live'
                ? { status: 'live', ptyIds: ['other'] }
                : { status: 'exited' },
            ...(mode === 'private-field' ? { prompt: 'private-unrequested-fixture' } : {})
          }
        })
        return { close }
      }
    )
    try {
      const file = join(root, 'watch.json')
      await writeFile(file, JSON.stringify({ ...target, watchMs: 1000 }))
      await main(['terminal', 'watch-exit', '--request-file', file, '--json'], root)
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
