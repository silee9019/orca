import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { main } from '../../src/cli/index'
import { RuntimeClient } from '../../src/cli/runtime/client'
it.each(['null', 'different', 'not-returned', 'reason', 'pty', 'host', 'request', 'private-field'])(
  'refuses an inconsistent applied resize receipt: %s',
  async (mode) => {
    const root = await mkdtemp(join(tmpdir(), 'orca-host-resize-protocol-')),
      target = {
        terminal: 'term_fixture',
        expectedPtyId: 'fixture',
        expectedIncarnationId: 'fixture-incarnation',
        expectedExecutionHostId: 'local',
        cols: 100,
        rows: 30,
        confirm: true
      },
      file = join(root, 'request.json')
    for (const key of ['ORCA_ENVIRONMENT', 'ORCA_PAIRING_CODE', 'ORCA_REMOTE_PAIRING']) {
      vi.stubEnv(key, undefined)
    }
    vi.stubEnv('ORCA_USER_DATA_PATH', root)
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(RuntimeClient.prototype, 'call').mockResolvedValue({
      id: 'fixture',
      ok: true,
      _meta: { runtimeId: 'fixture' },
      result: {
        ptyId: mode === 'pty' ? 'other' : target.expectedPtyId,
        executionHostId: mode === 'host' ? 'ssh:other' : 'local',
        requested: { cols: mode === 'request' ? 101 : 100, rows: 30 },
        providerCallReturned: mode !== 'not-returned',
        providerApplied: true,
        rendererApplied: false,
        applied: mode === 'null' ? null : { cols: mode === 'different' ? 99 : 100, rows: 30 },
        ...(mode === 'reason' ? { reason: 'unconfirmed' } : {}),
        ...(mode === 'private-field' ? { private: 'private-resize-canary' } : {})
      }
    })
    try {
      await writeFile(file, JSON.stringify(target))
      await main(['terminal', 'resize-host', '--request-file', file, '--json'], root)
      expect(process.exitCode).toBe(1)
      expect(JSON.stringify(output.mock.calls)).not.toContain('private-resize-canary')
      expect(output.mock.calls.map((call) => JSON.parse(String(call[0])))).toContainEqual(
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
