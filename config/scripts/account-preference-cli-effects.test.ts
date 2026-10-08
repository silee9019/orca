import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { parseArgs, specPaths, validateCommandAndFlags } from '../../src/cli/args'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { ACCOUNT_PREFERENCE_COMMAND_SPECS } from '../../src/cli/specs/account-preference'
import { ACCOUNT_PREFERENCE_HANDLERS } from '../../src/cli/handlers/account-preference'
import { ACCOUNT_PREFERENCE_METHODS } from '../../src/main/runtime/rpc/methods/account-preference'
import { setAccountPreferenceAccess } from '../../src/main/runtime/account-preference-access'
import type { RpcContext } from '../../src/main/runtime/rpc/core'

afterEach(() => {
  setAccountPreferenceAccess(null)
  vi.restoreAllMocks()
})

it('validates account preferences and uses the injected canonical writer for isolated persisted effects', async () => {
  const root = mkdtempSync(join(tmpdir(), 'orca-account-preferences-fixture-'))
  try {
    const path = join(root, 'settings')
    writeFileSync(
      path,
      JSON.stringify({
        localAccountRuntime: 'host',
        localAccountWslDistro: null,
        minimaxEndpoint: 'overseas',
        zcodePlanSite: 'zai',
        opencodeWorkspaceId: '',
        unrelatedSecret: 'fixture-private'
      }),
      { mode: 0o600 }
    )
    const read = () => JSON.parse(readFileSync(path, 'utf8'))
    const write = vi.fn(async (patch) => {
      writeFileSync(path, JSON.stringify({ ...read(), ...patch }), { mode: 0o600 })
      return read()
    })
    const validateWslTarget = vi.fn(async (distro) => {
      if (distro === 'missing') {
        throw new Error('WSL distro not available.')
      }
    })
    const client = new RuntimeClient(root, 100, null, null, 'orca')
    const method = ACCOUNT_PREFERENCE_METHODS[0]
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: this standalone RPC uses only clientKind and explicitly injected fixture settings callbacks.
    const context = {} as RpcContext
    vi.spyOn(client, 'call').mockImplementation(async (_, params) => ({
      id: 'fixture',
      ok: true,
      result: await method.handler(method.params.parse(params), context),
      _meta: { runtimeId: 'fixture' }
    }))
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const run = async (key?: string, value?: string) => {
      const specs = ACCOUNT_PREFERENCE_COMMAND_SPECS
      const parsed = parseArgs(
        [
          'account',
          'preference',
          key ? 'set' : 'status',
          '--json',
          ...(key ? ['--key', key, '--value', value ?? ''] : [])
        ],
        specs.flatMap(specPaths),
        specs
      )
      validateCommandAndFlags(specs, parsed)
      await ACCOUNT_PREFERENCE_HANDLERS[parsed.commandPath.join(' ')]({
        client,
        cwd: root,
        flags: parsed.flags,
        json: true
      })
    }
    await expect(run('minimaxEndpoint', 'cn')).rejects.toThrow(
      'canonical settings reader and writer'
    )
    expect(read().minimaxEndpoint).toBe('overseas')
    setAccountPreferenceAccess({ read, write })
    await expect(run('localAccountRuntime', 'wsl')).rejects.toThrow('validation is unavailable')
    expect(write).not.toHaveBeenCalled()
    setAccountPreferenceAccess({ read, write, validateWslTarget })
    for (const [key, value] of [
      ['localAccountRuntime', 'host'],
      ['localAccountWslDistro', 'Ubuntu'],
      ['minimaxEndpoint', 'cn'],
      ['zcodePlanSite', 'bigmodel'],
      ['opencodeWorkspaceId', 'fixture-workspace-private']
    ]) {
      await run(key, value)
    }
    expect(read()).toMatchObject({
      localAccountRuntime: 'wsl',
      localAccountWslDistro: 'Ubuntu',
      minimaxEndpoint: 'cn',
      zcodePlanSite: 'bigmodel',
      opencodeWorkspaceId: 'fixture-workspace-private',
      unrelatedSecret: 'fixture-private'
    })
    await expect(run('localAccountWslDistro', 'missing')).rejects.toThrow('not available')
    await expect(run('minimaxEndpoint', 'invalid')).rejects.toThrow('overseas or cn')
    expect(write).toHaveBeenCalledTimes(5)
    await run()
    expect(output.mock.calls.flat().join(' ')).not.toContain('fixture-private')
    expect(output.mock.calls.flat().join(' ')).not.toContain('fixture-workspace-private')
    expect(output.mock.calls.flat().join(' ')).toContain('opencodeWorkspaceConfigured')
    expect(() =>
      method.handler({ action: 'status' }, { ...context, clientKind: 'runtime' })
    ).toThrow('only available')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
