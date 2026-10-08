import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  createRuntime,
  createFolderWorkspaceRuntimeStore,
  makeFolderProjectGroup,
  makeFolderWorkspace,
  makeRuntimeStoreWithWorkspaceSession,
  TEST_FOLDER_WORKSPACE_KEY,
  syncSinglePty
} from '../../src/main/runtime/orca-runtime-test-fixtures.spec'
import { applyPtyBinding } from '../../src/main/persistence/loading-store/pty-binding-session-update'
import type { RuntimePtyController } from '../../src/main/runtime/runtime-pty-controller-contract'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { getDefaultWorkspaceSession } from '../../src/shared/constants'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { TERMINAL_METHODS } from '../../src/main/runtime/rpc/methods/terminal'
import { RuntimeRpcFailureError } from '../../src/cli/runtime/types'
import { main } from '../../src/cli/index'

const state = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('../../src/cli/runtime-client', async () => {
  const errors = await import('../../src/cli/runtime/types.js')
  class RuntimeClient {
    readonly isRemote = false
    call = state.call
  }
  return { RuntimeClient, ...errors }
})
let root: string
let runtime: ReturnType<typeof createRuntime>
const written: string[] = []
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-cli-terminal-host-'))
  runtime = createRuntime()
  written.length = 0
  runtime.setPtyController({
    write: (_ptyId, text) => {
      written.push(text)
      return true
    },
    kill: () => {
      throw new Error('Unexpected kill')
    },
    getForegroundProcess: async () => null,
    getSize: () => ({ cols: 80, rows: 24 })
  })
  syncSinglePty(runtime)
  bindRuntimeRpc()
  process.exitCode = undefined
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
function bindRuntimeRpc(): void {
  const rpc = new RpcDispatcher({ runtime, methods: TERMINAL_METHODS })
  state.call.mockImplementation(async (method: string, params: unknown) => {
    const response = await rpc.dispatch({ id: 'fixture', authToken: 'fixture', method, params })
    if (!response.ok) {
      throw new RuntimeRpcFailureError(response)
    }
    return response
  })
}
afterEach(async () => {
  vi.restoreAllMocks()
  process.exitCode = undefined
  await rm(root, { recursive: true, force: true })
})
async function command(...args: string[]) {
  vi.mocked(console.log).mockClear()
  await main(['terminal', ...args, '--json'], root)
  expect(process.exitCode, JSON.stringify(vi.mocked(console.error).mock.calls)).toBeUndefined()
  const output = vi.mocked(console.log).mock.calls.at(-1)?.[0]
  if (typeof output !== 'string') {
    throw new Error('Missing CLI JSON')
  }
  return JSON.parse(output)
}
it('reads host output and writes a client file through public CLI and real host service', async () => {
  const inventory = await command('list')
  const handle = inventory.result.terminals[0].handle
  runtime.onPtyData('pty-1', '한글 host output\r\n', 1)
  const read = await command('read', '--terminal', handle)
  expect(read.result.terminal.tail.join('\n')).toContain('한글 host output')
  const shown = await command('show', '--terminal', handle)
  expect(shown.result.terminal.handle).toBe(handle)
  const input = 'private 터미널 input\n'
  await writeFile(join(root, 'input.txt'), input)
  const receipt = await command('send', '--terminal', handle, '--text-file', 'input.txt')
  expect(receipt.result.send.accepted).toBe(true)
  expect(written.join('')).toBe(input)
  expect(JSON.stringify(receipt)).not.toContain('private 터미널 input')
})

it('persists folder terminal creation, rename, split and close through public CLI', async () => {
  const persisted = makeRuntimeStoreWithWorkspaceSession(getDefaultWorkspaceSession())
  runtime = new OrcaRuntimeService({
    ...createFolderWorkspaceRuntimeStore(
      makeFolderWorkspace({ folderPath: root }),
      makeFolderProjectGroup({ parentPath: root })
    ),
    ...persisted.runtimeStore
  })
  let spawned = 0
  const spawn = vi.fn(async (args: Parameters<NonNullable<RuntimePtyController['spawn']>>[0]) => {
    const id = spawned++ === 0 ? 'fixture-created' : 'fixture-split'
    const incarnationId = `${id}-incarnation`
    if (args.persistHostSessionBinding) {
      if (!args.worktreeId || !args.tabId || !args.leafId) {
        throw new Error('Missing host binding identity')
      }
      applyPtyBinding(
        {
          worktreeId: args.worktreeId,
          tabId: args.tabId,
          leafId: args.leafId,
          ptyId: id,
          incarnationId,
          hostAdmittedMembership: true,
          ...(args.expectedSourceBinding
            ? { expectedSourceBinding: args.expectedSourceBinding }
            : {})
        },
        persisted.getSession(),
        args.worktreeId,
        `${args.tabId}:${args.leafId}`
      )
    }
    return { id, incarnationId }
  })
  const stop = vi.fn(async (ptyId: string) => {
    await runtime.onPtyExit(ptyId, 0)
    return true
  })
  runtime.setPtyController({
    spawn,
    write: () => true,
    kill: () => {
      throw new Error('Unexpected unconfirmed kill')
    },
    stopAndWait: stop,
    getForegroundProcess: async () => null,
    getSize: () => ({ cols: 80, rows: 24 })
  })
  bindRuntimeRpc()
  const created = await command(
    'create',
    '--worktree',
    `id:${TEST_FOLDER_WORKSPACE_KEY}`,
    '--title',
    'folder worker'
  )
  const terminal = created.result.terminal
  expect(terminal.surface).toBe('background')
  expect(spawn).toHaveBeenCalledWith(
    expect.objectContaining({ cwd: root, worktreeId: TEST_FOLDER_WORKSPACE_KEY })
  )
  expect(persisted.getSession().tabsByWorktree[TEST_FOLDER_WORKSPACE_KEY]).toEqual([
    expect.objectContaining({ id: terminal.tabId, ptyId: 'fixture-created' })
  ])
  await command('rename', '--terminal', terminal.handle, '--title', 'renamed worker')
  expect(persisted.getSession().tabsByWorktree[TEST_FOLDER_WORKSPACE_KEY][0].customTitle).toBe(
    'renamed worker'
  )
  const split = await command('split', '--terminal', terminal.handle, '--direction', 'vertical')
  const layout = persisted.getSession().terminalLayoutsByTabId[terminal.tabId]
  expect(layout.root.type).toBe('split')
  expect(Object.values(layout.ptyIdsByLeafId ?? {})).toEqual(
    expect.arrayContaining(['fixture-created', 'fixture-split'])
  )
  const closedSplit = await command('close', '--terminal', split.result.split.handle)
  expect(closedSplit.result.close.ptyKilled).toBe(true)
  expect(persisted.getSession().tabsByWorktree[TEST_FOLDER_WORKSPACE_KEY]).toHaveLength(1)
  const closed = await command('close', '--terminal', terminal.handle)
  expect(closed.result.close.ptyKilled).toBe(true)
  expect(persisted.getSession().tabsByWorktree[TEST_FOLDER_WORKSPACE_KEY] ?? []).toHaveLength(0)
  expect(stop.mock.calls.map(([ptyId]) => ptyId)).toEqual(['fixture-split', 'fixture-created'])
})
