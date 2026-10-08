import { afterEach, expect, it, vi } from 'vitest'
import { parseArgs, specPaths, validateCommandAndFlags } from '../../src/cli/args'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { ANTIGRAVITY_ACCOUNT_COMMAND_SPECS } from '../../src/cli/specs/antigravity-accounts'
import { ANTIGRAVITY_ACCOUNT_HANDLERS } from '../../src/cli/handlers/antigravity-accounts'
import { ANTIGRAVITY_ACCOUNT_METHODS } from '../../src/main/runtime/rpc/methods/antigravity-accounts'
import { credential, harness } from '../../src/main/antigravity/native-account-test-fixtures'
import type { RpcContext } from '../../src/main/runtime/rpc/core'

const fixture = vi.hoisted(() => ({ getService: vi.fn() }))
vi.mock('../../src/main/antigravity/native-account-host', () => ({
  getAntigravityAccountService: fixture.getService
}))
afterEach(() => vi.restoreAllMocks())

it('runs public Antigravity account commands through existing RPC and native credential fixture service', async () => {
  const h = harness()
  fixture.getService.mockReturnValue(h.service)
  const client = new RuntimeClient('/unused-fixture', 100, null, null, 'orca')
  const [list, add, select, remove] = ANTIGRAVITY_ACCOUNT_METHODS
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: existing Antigravity RPC methods obtain only the mocked native account host service and never access context.
  const context = {} as RpcContext
  let changeDuringUsage = false
  const call = vi.spyOn(client, 'call').mockImplementation(async (name, params) => {
    const result =
      name === list.name
        ? await list.handler(list.params.parse(params), context)
        : name === add.name
          ? await add.handler(add.params.parse(params), context)
          : name === select.name
            ? await select.handler(select.params.parse(params), context)
            : name === remove.name
              ? await remove.handler(remove.params.parse(params), context)
              : { rateLimits: { antigravity: { windows: [] } } }
    if (name === 'accounts.list' && changeDuringUsage) {
      h.setNative(credential('c'))
    }
    return { id: 'fixture', ok: true, result, _meta: { runtimeId: 'fixture' } }
  })
  const output = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  const run = async (action: string, accountId?: string, confirmed = false) => {
    const specs = ANTIGRAVITY_ACCOUNT_COMMAND_SPECS
    const parsed = parseArgs(
      [
        'account',
        'antigravity',
        action,
        '--json',
        ...(accountId ? ['--account', accountId] : []),
        ...(confirmed ? ['--confirm', 'true'] : [])
      ],
      specs.flatMap(specPaths),
      specs
    )
    validateCommandAndFlags(specs, parsed)
    await ANTIGRAVITY_ACCOUNT_HANDLERS[parsed.commandPath.join(' ')]({
      client,
      cwd: '/fixture',
      flags: parsed.flags,
      json: true
    })
  }
  await run('add-current')
  const a = (await h.service.listAccounts()).activeAccountId
  expect(a).toBeTruthy()
  h.setNative(credential('b'))
  await run('add-current')
  const b = (await h.service.listAccounts()).activeAccountId
  if (!a || !b) {
    throw new Error('Missing fixture accounts')
  }
  await run('list')
  await run('select', a)
  expect(h.getNative()).toBe(credential('a'))
  await expect(run('rm', a, true)).rejects.toThrow('Select another')
  const callsBeforeRejectedRemove = call.mock.calls.length
  await expect(run('rm', b)).rejects.toThrow('--confirm true')
  expect(call).toHaveBeenCalledTimes(callsBeforeRejectedRemove)
  await run('rm', b, true)
  expect(h.getVault().accounts.map((account) => account.id)).toEqual([a])
  await run('usage')
  expect(call).toHaveBeenCalledWith('accounts.list', { refreshUsage: true })
  changeDuringUsage = true
  await expect(run('usage')).rejects.toThrow('native account changed')
  expect(output.mock.calls.flat().join(' ')).not.toContain('refresh-1')
})
