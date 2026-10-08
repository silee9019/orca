import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { store, TEST_WORKTREE_ID } from '../../src/main/runtime/orca-runtime-test-fixtures.spec'
import type { RuntimeNotifier } from '../../src/main/runtime/runtime-notifier-contract'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { TERMINAL_LIFECYCLE_METHODS } from '../../src/main/runtime/rpc/methods/terminal/terminal-lifecycle-methods'
import { RuntimeRpcFailureError } from '../../src/cli/runtime/types'
import { main } from '../../src/cli/index'

const mocks = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('../../src/cli/runtime-client', async () => ({
  ...(await import('../../src/cli/runtime/types.js')),
  RuntimeClient: class {
    readonly isRemote = false
    call = mocks.call
  }
}))
let runtime: OrcaRuntimeService
let terminal: string
function notifier(
  revealTerminalSession: RuntimeNotifier['revealTerminalSession']
): RuntimeNotifier {
  return {
    worktreesChanged: vi.fn(),
    reposChanged: vi.fn(),
    activateWorktree: vi.fn(),
    createTerminal: vi.fn(),
    revealTerminalSession,
    splitTerminal: vi.fn(),
    renameTerminal: vi.fn(),
    focusTerminal: vi.fn(),
    closeTerminal: vi.fn(),
    sleepWorktree: vi.fn(),
    terminalFitOverrideChanged: vi.fn(),
    terminalDriverChanged: vi.fn()
  }
}
beforeEach(async () => {
  runtime = new OrcaRuntimeService(store)
  runtime.setPtyController({
    write: () => true,
    kill: () => true,
    getForegroundProcess: async () => null
  })
  runtime.registerPty('fixture-switch-pty', TEST_WORKTREE_ID)
  const found = (await runtime.listTerminals()).terminals.find(
    (value) => value.ptyId === 'fixture-switch-pty'
  )
  if (!found) {
    throw new Error('fixture terminal missing')
  }
  terminal = found.handle
  mocks.call.mockReset().mockImplementation(async (method: string, params: unknown) => {
    const response = await new RpcDispatcher({
      runtime,
      methods: TERMINAL_LIFECYCLE_METHODS
    }).dispatch({ id: 'fixture', authToken: 'fixture', method, params })
    if (!response.ok) {
      throw new RuntimeRpcFailureError(response)
    }
    return response
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  process.exitCode = 0
})
async function cli(alias = 'switch') {
  const stdout = vi.spyOn(console, 'log').mockImplementation(() => {})
  const stderr = vi.spyOn(console, 'error').mockImplementation(() => {})
  process.exitCode = 0
  try {
    await main(['terminal', alias, '--terminal', terminal, '--json'], '/fixture')
    const text = stdout.mock.calls.map((call) => call.join(' ')).join('\n')
    const parsed: unknown = text ? JSON.parse(text) : null
    return { code: Number(process.exitCode), parsed, text }
  } finally {
    stdout.mockRestore()
    stderr.mockRestore()
  }
}
it.each(['switch', 'focus'])(
  'routes %s through canonical host navigation and waits for the notifier',
  async (alias) => {
    let finish: ((value: { tabId: string }) => void) | undefined
    const reveal = vi.fn(
      () =>
        new Promise<{ tabId: string }>((resolve) => {
          finish = resolve
        })
    )
    runtime.setNotifier(notifier(reveal))
    let settled = false
    const pending = cli(alias).then((result) => {
      settled = true
      return result
    })
    await vi.waitFor(() => expect(reveal).toHaveBeenCalledOnce())
    expect(settled).toBe(false)
    expect(reveal).toHaveBeenCalledWith(
      TEST_WORKTREE_ID,
      expect.objectContaining({ ptyId: 'fixture-switch-pty' })
    )
    if (!finish) {
      throw new Error('fixture reveal missing')
    }
    finish({ tabId: 'fixture-viewer-tab' })
    expect(await pending).toMatchObject({
      code: 0,
      parsed: {
        result: { focus: { handle: terminal, tabId: 'fixture-viewer-tab', navigated: true } }
      }
    })
    expect(mocks.call).toHaveBeenCalledWith('terminal.focus', { terminal, navigation: 'host' })
  }
)
it('refuses to report success when the execution host has no notifier', async () => {
  expect((await cli()).code).toBe(1)
})
it('refuses to report success if the notifier is replaced during navigation', async () => {
  let finish: ((value: { tabId: string }) => void) | undefined
  const reveal = vi.fn(
    () =>
      new Promise<{ tabId: string }>((resolve) => {
        finish = resolve
      })
  )
  runtime.setNotifier(notifier(reveal))
  const pending = cli()
  await vi.waitFor(() => expect(reveal).toHaveBeenCalledOnce())
  runtime.setNotifier(null)
  if (!finish) {
    throw new Error('fixture reveal missing')
  }
  finish({ tabId: 'fixture-viewer-tab' })
  expect((await pending).code).toBe(1)
})
it('preserves host errors without a local navigation fallback', async () => {
  mocks.call.mockImplementation(async () => {
    throw new RuntimeRpcFailureError({
      id: 'fixture',
      ok: false,
      error: { code: 'method_not_found', message: 'fixture old host' }
    })
  })
  expect((await cli()).code).toBe(1)
  expect(mocks.call).toHaveBeenCalledTimes(1)
})

it('refuses an older host receipt without an explicit navigation confirmation', async () => {
  mocks.call.mockResolvedValue({
    id: 'fixture',
    ok: true,
    result: { focus: { handle: terminal, tabId: 'fixture-old-tab', worktreeId: TEST_WORKTREE_ID } }
  })
  expect((await cli()).code).toBe(1)
  expect(mocks.call).toHaveBeenCalledTimes(1)
})
it('retains the negative receipt when navigation was skipped', async () => {
  expect(await cli()).toMatchObject({
    code: 1,
    parsed: { result: { focus: { handle: terminal, navigated: false } } }
  })
})
