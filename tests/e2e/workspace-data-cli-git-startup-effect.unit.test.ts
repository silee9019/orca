import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { HandlerContext } from '../../src/cli/dispatch'

const fixture = vi.hoisted(() => ({
  handlers: new Map<string, () => unknown>(),
  state: {
    shellPathReady: Promise.resolve(),
    managedWslCliStartupBarrierReady: Promise.resolve(),
    firstWindowStartupServicesReady: Promise.resolve()
  }
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((name: string, handler: () => unknown) => fixture.handlers.set(name, handler))
  }
}))
vi.mock('../../src/main/startup/main-process-state', () => ({ mainProcessState: fixture.state }))
vi.mock('../../src/main/startup/startup-diagnostics', () => ({ logStartupMilestone: vi.fn() }))
vi.mock('../../src/main/startup/os-opened-documents', () => ({ resolveOsOpenedDocuments: vi.fn() }))
vi.mock('../../src/main/native-chat/agent-session-wire/structured-agent-session-registry', () => ({
  onStructuredAgentSessionsHeldChanged: vi.fn(),
  structuredAgentSessionsHeld: vi.fn()
}))

import { registerMainProcessIpcHandlers } from '../../src/main/startup/main-process-ipc-bootstrap'
import { WORKSPACE_GIT_STARTUP_HANDLERS } from '../../src/cli/handlers/workspace-git-startup'
import { RuntimeClient, RuntimeClientError } from '../../src/cli/runtime-client'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import {
  setGitEnvironmentStartupBarrierForRpc,
  WORKSPACE_GIT_STARTUP_METHODS
} from '../../src/main/runtime/rpc/methods/workspace-git-startup'

let ctx: HandlerContext

function deferred() {
  let resolve = (): void => {}
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

beforeEach(() => {
  fixture.handlers.clear()
  fixture.state.shellPathReady = Promise.resolve()
  fixture.state.managedWslCliStartupBarrierReady = Promise.resolve()
  fixture.state.firstWindowStartupServicesReady = Promise.resolve()
  setGitEnvironmentStartupBarrierForRpc(null)
  const dispatcher = new RpcDispatcher({
    runtime: new OrcaRuntimeService(),
    methods: WORKSPACE_GIT_STARTUP_METHODS
  })
  const client = new RuntimeClient('fixture-unused')
  vi.spyOn(client, 'call').mockImplementation(async (method, params) => {
    const response = await dispatcher.dispatch({
      id: 'fixture',
      authToken: 'fixture',
      method,
      params
    })
    if (!response.ok) {
      throw new RuntimeClientError(response.error.code, response.error.message)
    }
    return response
  })
  ctx = { client, cwd: process.cwd(), json: true, flags: new Map() }
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  setGitEnvironmentStartupBarrierForRpc(null)
  vi.restoreAllMocks()
})

it('shares the desktop PATH and WSL barriers without waiting for unrelated PTY services', async () => {
  registerMainProcessIpcHandlers()
  const shell = deferred()
  const wsl = deferred()
  fixture.state.shellPathReady = shell.promise
  fixture.state.managedWslCliStartupBarrierReady = wsl.promise
  fixture.state.firstWindowStartupServicesReady = new Promise(() => {})
  let ipcSettled = false
  const ipc = Promise.resolve(
    fixture.handlers.get('app:awaitGitEnvironmentStartupBarrier')!()
  ).then(() => {
    ipcSettled = true
  })
  const cli = WORKSPACE_GIT_STARTUP_HANDLERS['git await-environment'](ctx)
  await new Promise((resolve) => setImmediate(resolve))
  expect(console.log).not.toHaveBeenCalled()
  expect(ipcSettled).toBe(false)
  shell.resolve()
  await new Promise((resolve) => setImmediate(resolve))
  expect(console.log).not.toHaveBeenCalled()
  expect(ipcSettled).toBe(false)
  wsl.resolve()
  await Promise.all([ipc, cli])
  expect(ipcSettled).toBe(true)
  expect(JSON.parse(vi.mocked(console.log).mock.calls[0][0])).toMatchObject({
    ok: true,
    result: { settled: true }
  })
})

it('rejects a host without the desktop service instead of reading default resolved state', async () => {
  await expect(WORKSPACE_GIT_STARTUP_HANDLERS['git await-environment'](ctx)).rejects.toMatchObject({
    code: 'runtime_unavailable'
  })
  expect(console.log).not.toHaveBeenCalled()
})

it('does not print a settled acknowledgement when the registered barrier rejects', async () => {
  setGitEnvironmentStartupBarrierForRpc(async () => {
    throw new Error('fixture barrier failed')
  })
  await expect(WORKSPACE_GIT_STARTUP_HANDLERS['git await-environment'](ctx)).rejects.toMatchObject({
    code: 'runtime_error',
    message: 'fixture barrier failed'
  })
  expect(console.log).not.toHaveBeenCalled()
})

it('fails once on an old peer without trying a local startup service', async () => {
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'old host')
  )
  await expect(WORKSPACE_GIT_STARTUP_HANDLERS['git await-environment'](ctx)).rejects.toMatchObject({
    code: 'method_not_found'
  })
  expect(ctx.client.call).toHaveBeenCalledTimes(1)
  expect(console.log).not.toHaveBeenCalled()
})
