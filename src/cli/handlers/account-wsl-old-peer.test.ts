import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { parseArgs, specPaths, validateCommandAndFlags } from '../args'
import { RuntimeClient, RuntimeClientError } from '../runtime-client'
import { ACCOUNT_COMMAND_SPECS } from '../specs/account'
import { ACCOUNT_HANDLERS } from './account'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

it.each(['claude', 'codex'] as const)(
  'preserves the exact WSL %s target for env/UNC callers and refuses old-peer native fallback',
  async (provider) => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    vi.stubEnv('ORCA_CLI_CWD', '/mnt/c/fixture')
    const folder = mkdtempSync(join(tmpdir(), 'orca-account-folder-'))
    try {
      const client = new RuntimeClient(folder, 100, null, null, 'orca')
      const nativeSelect = vi.fn()
      const nativeRemove = vi.fn()
      let supported = true
      const method = `accounts.select${provider === 'claude' ? 'Claude' : 'Codex'}ForTarget`
      const call = vi.spyOn(client, 'call').mockImplementation(async (name) => {
        if (name === method) {
          if (!supported) {
            throw new RuntimeClientError(
              'method_not_found',
              'Fixture old peer does not support target selection.'
            )
          }
          return {
            id: 'fixture',
            ok: true,
            result: { accounts: [], activeAccountId: null },
            _meta: { runtimeId: 'fixture' }
          }
        }
        if (name.startsWith('accounts.select')) {
          nativeSelect()
        }
        if (name.startsWith('accounts.remove')) {
          nativeRemove()
        }
        throw new Error('Unexpected native account mutation')
      })
      vi.spyOn(console, 'log').mockImplementation(() => undefined)
      for (const source of ['env', 'unc']) {
        vi.stubEnv('ORCA_CLI_WSL_DISTRO', source === 'env' ? 'FixtureWSL' : '')
        for (const account of ['fixture-account', 'system']) {
          const specs = ACCOUNT_COMMAND_SPECS
          const parsed = parseArgs(
            ['account', 'select', '--agent', provider, '--account', account, '--json'],
            specs.flatMap(specPaths),
            specs
          )
          validateCommandAndFlags(specs, parsed)
          const ctx = {
            client,
            cwd: source === 'env' ? folder : String.raw`\\wsl.localhost\FixtureWSL\home\fixture`,
            flags: parsed.flags,
            json: true
          }
          supported = true
          await ACCOUNT_HANDLERS['account select'](ctx)
          expect(call).toHaveBeenLastCalledWith(method, {
            accountId: account === 'system' ? null : account,
            target: { runtime: 'wsl', wslDistro: 'FixtureWSL' }
          })
          supported = false
          const before = call.mock.calls.length
          await expect(ACCOUNT_HANDLERS['account select'](ctx)).rejects.toMatchObject({
            code: 'method_not_found'
          })
          expect(call).toHaveBeenCalledTimes(before + 1)
          expect(nativeSelect).not.toHaveBeenCalled()
          expect(nativeRemove).not.toHaveBeenCalled()
        }
      }
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  }
)
