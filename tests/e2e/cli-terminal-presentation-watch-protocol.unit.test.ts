import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { main } from '../../src/cli/index'
import { RuntimeClient } from '../../src/cli/runtime/client'
import { REMOTE_RUNTIME_MAX_OUTBOUND_JSON_BYTES } from '../../src/shared/remote-runtime-memory-limits'

it.each(['malformed', 'sequence', 'kind', 'before-ready', 'slow-consumer'])(
  'refuses unsafe presentation frames and closes its subscription: %s',
  async (mode) => {
    const root = await mkdtemp(join(tmpdir(), 'orca-presentation-protocol-'))
    const close = vi.fn()
    const controllerSignals: AbortSignal[] = []
    for (const key of ['ORCA_ENVIRONMENT', 'ORCA_PAIRING_CODE', 'ORCA_REMOTE_PAIRING']) {
      vi.stubEnv(key, undefined)
    }
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(RuntimeClient.prototype, 'subscribeTerminalPresentation').mockImplementation(
      async (_params, callbacks, signal) => {
        controllerSignals.push(signal)
        const ready = { type: 'ready', kind: 'driver', sequence: 0 }
        const event = { type: 'event', kind: 'driver', sequence: 1, value: { kind: 'idle' } }
        const emit = (result: unknown) =>
          callbacks.onResponse({ id: 'fixture', ok: true, _meta: { runtimeId: 'fixture' }, result })
        if (mode !== 'before-ready') {
          emit(ready)
        }
        if (mode === 'slow-consumer') {
          vi.spyOn(process.stdout, 'writableLength', 'get').mockReturnValue(
            REMOTE_RUNTIME_MAX_OUTBOUND_JSON_BYTES
          )
          emit(event)
        } else if (mode === 'malformed') {
          emit({ ...event, privateUnknown: 'fixture-private-unexpected' })
        } else if (mode === 'sequence') {
          emit({ ...event, sequence: 2 })
        } else if (mode === 'kind') {
          emit({
            type: 'event',
            kind: 'fit',
            sequence: 1,
            value: { mode: 'desktop-fit', cols: 80, rows: 24 }
          })
        } else {
          emit(event)
        }
        return { close }
      }
    )
    try {
      const file = join(root, 'request.json')
      await writeFile(
        file,
        JSON.stringify({
          terminal: 't1',
          expectedPtyId: 'fixture',
          expectedIncarnationId: 'fixture',
          expectedExecutionHostId: 'local',
          watchMs: 1000
        })
      )
      await main(['terminal', 'watch-driver', '--request-file', file, '--json'], root)
      expect(process.exitCode).toBe(1)
      expect(close).toHaveBeenCalledOnce()
      expect(controllerSignals).toHaveLength(1)
      expect(controllerSignals[0].aborted).toBe(true)
      const frames = output.mock.calls.map((call) => JSON.parse(String(call[0])))
      expect(frames).not.toContainEqual(expect.objectContaining({ type: 'event' }))
      expect(JSON.stringify(frames)).not.toContain('fixture-private-unexpected')
      expect(frames).toContainEqual(
        expect.objectContaining({
          ok: false,
          error: expect.objectContaining({
            code: mode === 'slow-consumer' ? 'slow_consumer' : 'invalid_runtime_response'
          })
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
