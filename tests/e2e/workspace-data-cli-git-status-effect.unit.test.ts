import { directory, source, store, ctx, git } from './workspace-data-cli-remote-clone-fixture'
import { writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { WORKSPACE_GIT_STATUS_HANDLERS } from '../../src/cli/handlers/workspace-git-status'
import {
  WORKSPACE_GIT_STATUS_METHODS,
  setDesktopGitStatusForRpc
} from '../../src/main/runtime/rpc/methods/workspace-git-status'
import { registerFilesystemGitStatusHandlers } from '../../src/main/ipc/filesystem/filesystem-git-status-handlers'
import { createFilesystemHandlerContext } from '../../src/main/ipc/filesystem/filesystem-handler-context'
import { createSenderScopedRequestCancellations } from '../../src/main/ipc/sender-scoped-request-cancellation'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClientError } from '../../src/cli/runtime-client'
import { DesktopGitStatusStart } from '../../src/shared/rpc-contract/workspace-git-status-params'
let runtime: OrcaRuntimeService
let target: { worktreeId: string; identityKey: string; executionHostId: 'local' }
async function invoke(action: string, params: object) {
  const input = join(directory, 'status-params.json')
  await writeFile(input, JSON.stringify({ expectedExecutionHostId: 'local', ...params }))
  ctx.flags = new Map([['params-file', input]])
  await WORKSPACE_GIT_STATUS_HANDLERS[`git desktop-status-${action}`](ctx)
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result
}
async function wait(id: string, state: string) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const value = await invoke('status', { requestId: id })
    if (value.state === state) {
      return
    }
    if (['completed', 'failed', 'cancelled'].includes(value.state)) {
      throw new Error(`Unexpected status state: ${value.state}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('Status did not settle')
}
beforeEach(async () => {
  store.addRepo({
    id: 'status-fixture',
    path: source,
    displayName: 'Fixture',
    badgeColor: 'blue',
    addedAt: 1
  })
  runtime = new OrcaRuntimeService(store)
  const worktree = await runtime.showManagedWorktree(`path:${source}`)
  if (!worktree.identity) {
    throw new Error('Missing fixture identity')
  }
  target = { worktreeId: worktree.id, identityKey: worktree.identity.key, executionHostId: 'local' }
  registerFilesystemGitStatusHandlers(
    createFilesystemHandlerContext(
      store,
      undefined,
      createSenderScopedRequestCancellations(),
      createSenderScopedRequestCancellations()
    )
  )
  const dispatcher = new RpcDispatcher({ runtime, methods: WORKSPACE_GIT_STATUS_METHODS })
  vi.mocked(ctx.client.call).mockImplementation(async (method, params) => {
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
})
afterEach(() => setDesktopGitStatusForRpc(null))
it('reads actual Git changes and original ignored-path metadata through CLI/RPC/runtime status', async () => {
  await writeFile(join(source, '.gitignore'), 'ignored.log\n')
  await writeFile(join(source, 'tracked.txt'), 'first\n')
  await git(['add', '.gitignore', 'tracked.txt'], source)
  await git(['commit', '-m', 'Fixture files'], source)
  await writeFile(join(source, 'tracked.txt'), 'first\nsecond\n')
  await writeFile(join(source, 'untracked.txt'), 'private content')
  await writeFile(join(source, 'ignored.log'), 'ignored')
  const request = await invoke('start', { target, includeIgnored: true })
  await wait(request.requestId, 'completed')
  const result = await invoke('result', { requestId: request.requestId, limit: 500 })
  expect(result.status.entries).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ path: 'tracked.txt', status: 'modified' }),
      expect.objectContaining({ path: 'untracked.txt', status: 'untracked' })
    ])
  )
  expect(result.status.ignoredPaths).toContain('ignored.log')
  expect(JSON.stringify(result)).not.toContain('private content')
  expect(await readFile(join(source, 'tracked.txt'), 'utf8')).toBe('first\nsecond\n')
  expect((await invoke('status', { requestId: request.requestId })).executionVerdict).toBe(
    'unverifiable'
  )
  await invoke('cancel', { requestId: request.requestId })
  await expect(invoke('result', { requestId: request.requestId })).rejects.toThrow()
})
it('delivers only its own signal, retains pending ownership and discards late service results', async () => {
  let signal: AbortSignal | undefined
  let finish: ((value: { entries: []; conflictOperation: 'unknown' }) => void) | undefined
  vi.spyOn(runtime, 'getRuntimeGitStatus').mockImplementation(async (_selector, options) => {
    signal = options?.signal
    return new Promise((resolve) => {
      finish = resolve
    })
  })
  const request = await invoke('start', { target })
  await vi.waitFor(() => expect(finish).toBeDefined())
  registerFilesystemGitStatusHandlers(
    createFilesystemHandlerContext(
      store,
      undefined,
      createSenderScopedRequestCancellations(),
      createSenderScopedRequestCancellations()
    )
  )
  await expect(invoke('start', { target })).rejects.toThrow('desktop_git_status_busy')
  expect(signal?.aborted).toBe(false)
  await expect(
    invoke('cancel', { requestId: '00000000-0000-4000-8000-000000000000' })
  ).rejects.toThrow()
  await invoke('cancel', { requestId: request.requestId })
  expect(signal?.aborted).toBe(true)
  finish?.({ entries: [], conflictOperation: 'unknown' })
  await wait(request.requestId, 'cancelled')
  await expect(invoke('result', { requestId: request.requestId })).rejects.toThrow()
})
it('discards results when the selected workspace identity changes while reading', async () => {
  const show = runtime.showManagedWorktree.bind(runtime)
  let moved = false
  vi.spyOn(runtime, 'showManagedWorktree').mockImplementation(async (selector) => {
    const value = await show(selector)
    return moved ? { ...value, instanceId: 'replacement' } : value
  })
  vi.spyOn(runtime, 'getRuntimeGitStatus').mockImplementation(async () => {
    moved = true
    return { entries: [], conflictOperation: 'unknown' }
  })
  const request = await invoke('start', { target })
  await wait(request.requestId, 'failed')
  await expect(invoke('result', { requestId: request.requestId })).rejects.toThrow()
})
it('rejects caller authority, unsafe options, stale identity, unavailable services and old peers', async () => {
  for (const extra of [
    { requestToken: 'renderer' },
    { admissionTier: 'interactive' },
    { signal: {} },
    { branchLineTotalMergeBase: 'HEAD' },
    { includeIgnored: 'yes' }
  ]) {
    expect(
      DesktopGitStatusStart.safeParse({ expectedExecutionHostId: 'local', target, ...extra })
        .success
    ).toBe(false)
  }
  const request = await invoke('start', { target: { ...target, identityKey: 'stale' } })
  await wait(request.requestId, 'failed')
  setDesktopGitStatusForRpc(null)
  await expect(invoke('start', { target })).rejects.toMatchObject({ code: 'runtime_unavailable' })
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'Old peer')
  )
  await expect(invoke('start', { target })).rejects.toMatchObject({ code: 'method_not_found' })
})
