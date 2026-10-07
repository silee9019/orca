import { mkdtempSync, readFileSync, statSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { parseArgs, specPaths, validateCommandAndFlags } from '../../src/cli/args'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { ACCOUNT_LOGIN_COMMAND_SPECS } from '../../src/cli/specs/account-login'
import { ACCOUNT_LOGIN_HANDLERS } from '../../src/cli/handlers/account-login'
import { ACCOUNT_LOGIN_METHODS } from '../../src/main/runtime/rpc/methods/account-login'
import {
  RuntimeAccountController,
  type RuntimeAccountServices
} from '../../src/main/runtime/runtime-account-controller'
import type { RpcContext } from '../../src/main/runtime/rpc/core'

afterEach(() => vi.restoreAllMocks())

it('drives fixture login start/status/cancel and privately exports the pending URL without overwriting', async () => {
  const root = mkdtempSync(join(tmpdir(), 'orca-login-cli-fixture-'))
  try {
    const url = 'https://auth.example.invalid/device?code=fixture-sensitive-device-code'
    let finish: (() => void) | undefined
    const controller = new RuntimeAccountController()
    const addAccount = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    const cancelPendingLogin = vi.fn(() => true)
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: these fixture methods are the complete login operation surface; actual OAuth and provider credentials are unavailable.
    controller.setServices({
      codexAccounts: { addAccount, cancelPendingLogin, getPendingLoginUrl: () => url }
    } as unknown as RuntimeAccountServices)
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: these RPC handlers reach only the two explicitly bound fixture-controller methods.
    const context = {
      runtime: {
        manageAccountLogin: controller.manageLogin.bind(controller),
        getCodexLoginUrl: controller.getCodexLoginUrl.bind(controller)
      }
    } as unknown as RpcContext
    const client = new RuntimeClient(root, 100, null, null, 'orca')
    const [urlMethod, start, status, cancel] = ACCOUNT_LOGIN_METHODS
    vi.spyOn(client, 'call').mockImplementation(async (name, params) => {
      const result =
        name === urlMethod.name
          ? urlMethod.handler(undefined, context)
          : name === start.name
            ? start.handler(start.params.parse(params), context)
            : name === cancel.name
              ? cancel.handler(cancel.params.parse(params), context)
              : status.handler(status.params.parse(params), context)
      return { id: 'fixture', ok: true, result, _meta: { runtimeId: 'fixture' } }
    })
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const run = async (action: string, extra: string[] = []) => {
      const specs = ACCOUNT_LOGIN_COMMAND_SPECS
      const parsed = parseArgs(
        ['account', 'login', action, '--agent', 'codex', '--json', ...extra],
        specs.flatMap(specPaths),
        specs
      )
      validateCommandAndFlags(specs, parsed)
      return ACCOUNT_LOGIN_HANDLERS[parsed.commandPath.join(' ')]({
        client,
        cwd: root,
        flags: parsed.flags,
        json: true
      })
    }
    await run('start')
    expect(addAccount).toHaveBeenCalledTimes(1)
    const destination = join(root, 'authorization-url')
    await run('status', ['--url-file', destination])
    expect(readFileSync(destination, 'utf8')).toBe(`${url}\n`)
    if (process.platform !== 'win32') {
      expect(statSync(destination).mode & 0o777).toBe(0o600)
    }
    await expect(run('status', ['--url-file', destination])).rejects.toThrow('new writable path')
    expect(readFileSync(destination, 'utf8')).toBe(`${url}\n`)
    await expect(run('status', ['--url-file', join(root, 'missing', 'url')])).rejects.toThrow(
      'new writable path'
    )
    expect(output.mock.calls.flat().join(' ')).not.toContain('fixture-sensitive-device-code')
    await run('cancel')
    finish?.()
    await Promise.resolve()
    expect(controller.manageLogin({ provider: 'codex', action: 'status' }).status).toBe('cancelled')
    expect(() => urlMethod.handler(undefined, { ...context, clientKind: 'runtime' })).toThrow(
      'only available'
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
