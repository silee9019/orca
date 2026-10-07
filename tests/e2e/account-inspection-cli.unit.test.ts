import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { parseArgs, validateCommandAndFlags } from '../../src/cli/args'
import { ACCOUNT_INSPECTION_COMMAND_SPECS } from '../../src/cli/specs/account-inspection'
import { ACCOUNT_INSPECTION_HANDLERS } from '../../src/cli/handlers/account-inspection'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { ACCOUNT_INSPECTION_METHODS } from '../../src/main/runtime/rpc/methods/account-inspection'
import {
  _internals,
  recordCodexPaneAccount
} from '../../src/main/codex/codex-pane-account-registry'
import { getDefaultSettings } from '../../src/shared/constants'

vi.mock('electron', () => ({ app: { getPath: () => '/unused-fixture' } }))
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  _internals.resetCache()
})

it('parses exact pane actions through RPC and persists only the confirmed requested removal', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'orca-account-inspect-cli-'))
  vi.stubEnv('ORCA_USER_DATA_PATH', directory)
  _internals.resetCache()
  try {
    const settings = getDefaultSettings(directory)
    settings.activeCodexManagedAccountIdsByRuntime = { host: 'new-account', wsl: {} }
    recordCodexPaneAccount('pane-one', { selectionKey: 'host', accountId: 'old-account' })
    recordCodexPaneAccount('pane-two', { selectionKey: 'wsl:Ubuntu', accountId: null })
    const runtime = new OrcaRuntimeService()
    runtime.setAccountInspectionServices(() => settings, {
      getMirroredHostHomePathForStatus: () => ({ kind: 'unavailable' })
    })
    const client = new RuntimeClient(directory, 100, null, null, 'orca')
    const method = ACCOUNT_INSPECTION_METHODS[0]
    const call = vi.spyOn(client, 'call').mockImplementation(async (name, input) => {
      expect(name).toBe(method.name)
      const result = await method.handler(method.params.parse(input), { runtime })
      return { id: 'fixture', ok: true, result, _meta: { runtimeId: 'fixture-host' } }
    })
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    const run = async (argv: string[]) => {
      const parsed = parseArgs(
        ['account-inspect', ...argv],
        ACCOUNT_INSPECTION_COMMAND_SPECS.map((spec) => spec.path),
        ACCOUNT_INSPECTION_COMMAND_SPECS
      )
      validateCommandAndFlags(ACCOUNT_INSPECTION_COMMAND_SPECS, parsed)
      const handler = ACCOUNT_INSPECTION_HANDLERS[parsed.commandPath.join(' ')]
      if (!handler) {
        throw new Error('missing_handler')
      }
      await handler({ client, flags: parsed.flags, cwd: directory, json: true })
    }
    await run(['codex-stale-panes', '--pty-ids', 'pane-one,pane-two'])
    expect(String(output.mock.calls.at(-1)?.[0])).toContain('new-account')
    await expect(run(['codex-forget-panes', '--pty-ids', 'pane-one'])).rejects.toThrow()
    expect(call).toHaveBeenCalledTimes(1)
    await run(['codex-forget-panes', '--pty-ids', 'pane-one', '--confirm', 'true'])
    _internals.resetCache()
    expect(
      JSON.parse(readFileSync(join(directory, 'codex-pane-accounts.json'), 'utf8')).panes
    ).toEqual({ 'pane-two': { selectionKey: 'wsl:Ubuntu', accountId: null } })
    vi.stubEnv('ORCA_CLI_CWD', '/ssh-fixture')
    await expect(run(['codex-recorded-lanes', '--pty-ids', 'pane-two'])).rejects.toMatchObject({
      code: 'invalid_environment'
    })
    expect(call).toHaveBeenCalledTimes(2)
  } finally {
    _internals.resetCache()
    rmSync(directory, { recursive: true, force: true })
  }
})
