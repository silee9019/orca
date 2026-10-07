import { afterEach, expect, it, vi } from 'vitest'
import { parseArgs, specPaths, validateCommandAndFlags } from '../../src/cli/args'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { PROFILE_AUTH_COMMAND_SPECS } from '../../src/cli/specs/profile-auth'
import { PROFILE_AUTH_HANDLERS } from '../../src/cli/handlers/profile-auth'
import { PROFILE_AUTH_METHODS } from '../../src/main/runtime/rpc/methods/profile-auth'
import { RuntimeAccountController } from '../../src/main/runtime/runtime-account-controller'
import type { RpcContext } from '../../src/main/runtime/rpc/core'

const fixtures = vi.hoisted(() => ({ signOut: vi.fn(async () => ({ status: 'signed-out' })) }))
vi.mock('../../src/main/orca-profiles/profile-cloud-service', () => ({
  getCurrentOrcaProfileAuthStatus: () => ({ status: 'signed-out' }),
  signOutCurrentOrcaProfile: fixtures.signOut,
  connectCurrentOrcaProfile: vi.fn(),
  refreshCurrentOrcaProfileAuth: vi.fn(),
  selectCurrentOrcaProfileOrg: vi.fn()
}))
afterEach(() => vi.restoreAllMocks())

it('requires explicit sign-out confirmation in CLI and RPC before the canonical sign-out fence', async () => {
  const beforeSignOut = vi.fn()
  const controller = new RuntimeAccountController()
  controller.configureProfileAuth({
    userDataPath: '/isolated-fixture',
    onBeforeSignOut: beforeSignOut
  })
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the sole RPC dependency is this bound controller method backed by fixture profile services.
  const context = {
    runtime: { manageProfileAuth: controller.manageProfileAuth.bind(controller) }
  } as unknown as RpcContext
  const client = new RuntimeClient('/unused-fixture', 100, null, null, 'orca')
  const method = PROFILE_AUTH_METHODS[0]
  const call = vi.spyOn(client, 'call').mockImplementation(async (_, params) => ({
    id: 'fixture',
    ok: true,
    result: await method.handler(method.params.parse(params), context),
    _meta: { runtimeId: 'fixture' }
  }))
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  const run = async (extra: string[]) => {
    const specs = PROFILE_AUTH_COMMAND_SPECS
    const parsed = parseArgs(
      ['profile', 'auth', 'sign-out', '--json', ...extra],
      specs.flatMap(specPaths),
      specs
    )
    validateCommandAndFlags(specs, parsed)
    await PROFILE_AUTH_HANDLERS['profile auth sign-out']({
      client,
      cwd: '/fixture',
      flags: parsed.flags,
      json: true
    })
  }
  await expect(run([])).rejects.toThrow('--confirm true')
  expect(call).not.toHaveBeenCalled()
  expect(method.params.safeParse({ action: 'sign-out' }).success).toBe(false)
  expect(method.params.safeParse({ action: 'sign-out', confirm: false }).success).toBe(false)
  expect(beforeSignOut).not.toHaveBeenCalled()
  expect(fixtures.signOut).not.toHaveBeenCalled()
  await run(['--confirm', 'true'])
  expect(beforeSignOut).toHaveBeenCalledTimes(1)
  expect(fixtures.signOut).toHaveBeenCalledWith('/isolated-fixture')
})
