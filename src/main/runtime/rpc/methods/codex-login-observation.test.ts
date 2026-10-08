import type * as Os from 'node:os'
import { expect, it, vi } from 'vitest'
import { CODEX_LOGIN_OBSERVATION_METHODS } from './codex-login-observation'
import type { RpcContext } from '../core'
import { RuntimeAccountController } from '../../runtime-account-controller'
import { CodexAccountService } from '../../../codex-accounts/service'
import {
  createRateLimits,
  createRuntimeHome,
  createSettings,
  createStore,
  registerCodexAccountsTestHomes,
  testState
} from '../../../codex-accounts/service-test-harness'
vi.mock('electron', () => ({ app: { getPath: () => testState.userDataDir } }))
vi.mock('node:os', async () => ({
  ...(await vi.importActual<typeof Os>('node:os')),
  homedir: () => testState.fakeHomeDir
}))
registerCodexAccountsTestHomes()
it('streams the existing Codex URL listener as booleans with revisions and detaches only its own listener', async () => {
  type ServiceArguments = ConstructorParameters<typeof CodexAccountService>
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the existing store fixture supplies the constructor settings; this test invokes only pending URL observers.
  const store = createStore(createSettings()) as unknown as ServiceArguments[0]
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the existing rate-limit fixture supplies the constructor dependency; pending URL observers do not invoke it.
  const rateLimits = createRateLimits() as unknown as ServiceArguments[1]
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the existing runtime-home fixture supplies the constructor dependency; pending URL observers do not invoke it.
  const runtimeHome = createRuntimeHome() as unknown as ServiceArguments[2]
  const service = new CodexAccountService(store, rateLimits, runtimeHome)
  const ipc = vi.fn()
  service.onPendingLoginUrlChanged(ipc)
  const controller = new RuntimeAccountController()
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: observeCodexLogin reads only the supplied codexAccounts service, never the other runtime account services.
  controller.setServices({ codexAccounts: service } as unknown as Parameters<
    RuntimeAccountController['setServices']
  >[0])
  const abort = new AbortController()
  const emit = vi.fn()
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: this fixed streaming RPC uses only observeCodexLogin and the supplied AbortSignal.
  const ctx = {
    runtime: { observeCodexLogin: controller.observeCodexLogin.bind(controller) },
    signal: abort.signal
  } as unknown as RpcContext
  const method = CODEX_LOGIN_OBSERVATION_METHODS[0]
  const pending = method.handler(undefined, ctx, emit)
  const publish = Reflect.get(service, 'setPendingLoginUrl')
  if (typeof publish !== 'function') {
    throw new Error('missing fixture publication boundary')
  }
  publish.call(service, 'fixture-private-link-a')
  publish.call(service, 'fixture-private-link-b')
  publish.call(service, null)
  expect(emit.mock.calls.map(([event]) => event)).toEqual([
    { type: 'ready', pending: false, revision: 0 },
    { type: 'changed', pending: true, revision: 1 },
    { type: 'changed', pending: true, revision: 2 },
    { type: 'changed', pending: false, revision: 3 }
  ])
  expect(JSON.stringify(emit.mock.calls)).not.toContain('fixture-private-link')
  abort.abort()
  await pending
  publish.call(service, 'fixture-private-link-c')
  expect(emit).toHaveBeenCalledTimes(4)
  expect(ipc).toHaveBeenCalledTimes(4)
})
