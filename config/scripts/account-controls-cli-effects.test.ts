import { afterEach, expect, it, vi } from 'vitest'
import { parseArgs, specPaths, validateCommandAndFlags } from '../../src/cli/args'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { ACCOUNT_COMMAND_SPECS } from '../../src/cli/specs/account'
import { ACCOUNT_HANDLERS } from '../../src/cli/handlers/account'
import { ACCOUNT_METHODS } from '../../src/main/runtime/rpc/methods/accounts'
import {
  RuntimeAccountController,
  type RuntimeAccountServices
} from '../../src/main/runtime/runtime-account-controller'
import type { RpcContext } from '../../src/main/runtime/rpc/core'

afterEach(() => vi.restoreAllMocks())

it.each(['claude', 'codex'])(
  'runs public %s select/remove argv through actual parser, CLI handler, RPC and controller fixture state',
  async (provider) => {
    const controller = new RuntimeAccountController()
    let selected: string | null = null
    let accounts = [{ id: 'fixture-account' }]
    const state = () => ({ accounts, activeAccountId: selected })
    const service = {
      selectAccount: vi.fn(async (id: string | null) => {
        selected = id
        return state()
      }),
      removeAccount: vi.fn(async (id: string) => {
        accounts = accounts.filter((account) => account.id !== id)
        return state()
      })
    }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: each scenario invokes only selectAccount/removeAccount; absent provider operations fail instead of accessing real services.
    controller.setServices({
      claudeAccounts: service,
      codexAccounts: service
    } as unknown as RuntimeAccountServices)
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the named RPC operations reach only these bound account controller methods.
    const context = {
      runtime: {
        selectClaudeAccount: controller.selectClaude.bind(controller),
        selectCodexAccount: controller.selectCodex.bind(controller),
        removeClaudeAccount: controller.removeClaude.bind(controller),
        removeCodexAccount: controller.removeCodex.bind(controller)
      }
    } as unknown as RpcContext
    const client = new RuntimeClient('/unused-fixture', 100, null, null, 'orca')
    vi.spyOn(client, 'call').mockImplementation(async (name, params) => {
      const method = ACCOUNT_METHODS.find((entry) => entry.name === name)
      if (!method || !method.params) {
        throw new Error('Unexpected fixture RPC')
      }
      const result = await method.handler(method.params.parse(params), context)
      return { id: 'fixture', ok: true, result, _meta: { runtimeId: 'fixture' } }
    })
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    for (const [action, account] of [
      ['select', 'fixture-account'],
      ['select', 'system'],
      ['rm', 'fixture-account']
    ]) {
      const parsed = parseArgs(
        [
          'account',
          action,
          '--agent',
          provider,
          '--account',
          account,
          '--json',
          ...(action === 'rm' ? ['--confirm', 'true'] : [])
        ],
        ACCOUNT_COMMAND_SPECS.flatMap(specPaths),
        ACCOUNT_COMMAND_SPECS
      )
      validateCommandAndFlags(ACCOUNT_COMMAND_SPECS, parsed)
      await ACCOUNT_HANDLERS[parsed.commandPath.join(' ')]({
        client,
        cwd: '/fixture',
        flags: parsed.flags,
        json: true
      })
      expect(selected).toBe(action === 'select' && account !== 'system' ? 'fixture-account' : null)
    }
    expect(accounts).toEqual([])
    expect(service.selectAccount.mock.calls).toEqual([['fixture-account'], [null]])
    expect(service.removeAccount).toHaveBeenCalledWith('fixture-account')
  }
)
