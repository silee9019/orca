import { afterEach, expect, it, vi } from 'vitest'
import { parseArgs, specPaths, validateCommandAndFlags } from '../../src/cli/args'
import { ACCOUNT_LOGIN_HANDLERS } from '../../src/cli/handlers/account-login'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { ACCOUNT_LOGIN_COMMAND_SPECS } from '../../src/cli/specs/account-login'
import { AccountLoginStartParams } from '../../src/shared/rpc-contract/account-login-params'
import { ACCOUNT_LOGIN_METHODS } from '../../src/main/runtime/rpc/methods/account-login'
import type { RpcContext } from '../../src/main/runtime/rpc/core'
import {
  RuntimeAccountController,
  type RuntimeAccountServices
} from '../../src/main/runtime/runtime-account-controller'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

it.each([
  ['claude', 'resolve'],
  ['claude', 'reject'],
  ['codex', 'resolve'],
  ['codex', 'reject']
] as const)(
  'keeps a restarted %s CLI login independent of cancelled %s and the other provider',
  async (provider, oldOutcome) => {
    const old = Promise.withResolvers<void>()
    const current = Promise.withResolvers<void>()
    const next = Promise.withResolvers<void>()
    const add = vi
      .fn()
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(current.promise)
      .mockReturnValueOnce(next.promise)
    const other = Promise.withResolvers<void>()
    const otherAdd = vi.fn(() => other.promise)
    const controller = new RuntimeAccountController()
    const service = {
      addAccount: add,
      cancelPendingLogin: vi.fn(() => true),
      getPendingLoginUrl: () => null
    }
    const otherService = { ...service, addAccount: otherAdd }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: login reaches only these explicitly provided fixture methods; no real provider service is installed.
    controller.setServices({
      claudeAccounts: provider === 'claude' ? service : otherService,
      codexAccounts: provider === 'codex' ? service : otherService
    } as unknown as RuntimeAccountServices)
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the login RPC methods use only this bound controller operation.
    const context = {
      runtime: { manageAccountLogin: controller.manageLogin.bind(controller) }
    } as unknown as RpcContext
    const client = new RuntimeClient('/fixture', 100, null, null, 'orca')
    vi.spyOn(client, 'call').mockImplementation(async (name, params) => {
      const method = ACCOUNT_LOGIN_METHODS.find((entry) => entry.name === name)
      if (!method?.params) {
        throw new Error('Unexpected login fixture method')
      }
      return {
        id: 'fixture',
        ok: true,
        result: method.handler(method.params.parse(params), context),
        _meta: { runtimeId: 'fixture' }
      }
    })
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const run = async (action: string) => {
      const specs = ACCOUNT_LOGIN_COMMAND_SPECS
      const parsed = parseArgs(
        ['account', 'login', action, '--agent', provider, '--json'],
        specs.flatMap(specPaths),
        specs
      )
      validateCommandAndFlags(specs, parsed)
      await ACCOUNT_LOGIN_HANDLERS[parsed.commandPath.join(' ')]({
        client,
        cwd: '/fixture',
        flags: parsed.flags,
        json: true
      })
    }
    const otherProvider = provider === 'claude' ? 'codex' : 'claude'
    controller.manageLogin({ provider: otherProvider, action: 'start' })
    await run('start')
    await run('cancel')
    await run('start')
    if (oldOutcome === 'resolve') {
      old.resolve()
    } else {
      old.reject(new Error('fixture-private-old-attempt'))
    }
    await Promise.resolve()
    await run('status')
    expect(controller.manageLogin({ provider, action: 'status' }).status).toBe('pending')
    expect(controller.manageLogin({ provider: otherProvider, action: 'status' }).status).toBe(
      'pending'
    )
    current.resolve()
    await Promise.resolve()
    await run('status')
    expect(controller.manageLogin({ provider, action: 'status' }).status).toBe('completed')
    await run('start')
    next.reject(new Error('fixture-private-new-attempt'))
    await Promise.resolve()
    await run('status')
    expect(controller.manageLogin({ provider, action: 'status' }).status).toBe('failed')
    expect(add).toHaveBeenCalledTimes(3)
    expect(output.mock.calls.flat().join(' ')).not.toContain('fixture-private')
    await expect(run('finish')).rejects.toThrow()
    expect(AccountLoginStartParams.safeParse({ provider, action: 'finish' }).success).toBe(false)
    expect(AccountLoginStartParams.safeParse({ provider, accountId: ' ' }).success).toBe(false)
    expect(AccountLoginStartParams.safeParse({ provider: 'invalid-provider' }).success).toBe(false)
    expect(add).toHaveBeenCalledTimes(3)
    other.resolve()
  }
)

it('preserves an uncancellable login, reports timeout failure, and allows a later successful retry', async () => {
  vi.useFakeTimers()
  const controller = new RuntimeAccountController()
  const first = Promise.withResolvers<void>()
  const second = Promise.withResolvers<void>()
  const addAccount = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: this test exercises only the three provided login methods without any real provider.
  controller.setServices({
    claudeAccounts: { addAccount, cancelPendingLogin: () => false }
  } as unknown as RuntimeAccountServices)
  controller.manageLogin({ provider: 'claude', action: 'start' })
  expect(controller.manageLogin({ provider: 'claude', action: 'cancel' }).status).toBe('pending')
  setTimeout(() => first.reject(new Error('fixture-private-timeout')), 25)
  await vi.advanceTimersByTimeAsync(25)
  expect(controller.manageLogin({ provider: 'claude', action: 'status' })).toEqual({
    status: 'failed'
  })
  controller.manageLogin({ provider: 'claude', action: 'start' })
  second.resolve()
  await Promise.resolve()
  expect(controller.manageLogin({ provider: 'claude', action: 'status' })).toEqual({
    status: 'completed'
  })
  expect(addAccount).toHaveBeenCalledTimes(2)
})
