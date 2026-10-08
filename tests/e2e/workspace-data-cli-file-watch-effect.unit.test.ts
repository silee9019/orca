import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { directory, source, store, ctx } from './workspace-data-cli-remote-clone-fixture'
import { loadParcelWatcher } from '../../src/main/ipc/parcel-watcher-module-loader'
import { WORKSPACE_FILE_WATCH_HANDLERS } from '../../src/cli/handlers/workspace-file-watch'
import {
  WORKSPACE_FILE_WATCH_METHODS,
  disposeCliFileWatches
} from '../../src/main/runtime/rpc/methods/workspace-file-watch'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClientError } from '../../src/cli/runtime-client'
import { createFolderWorkspace } from '../../src/main/ipc/worktrees/create/folder-workspace-creation'
import {
  CliFileWatchStart,
  CliFileWatchStatus
} from '../../src/shared/rpc-contract/workspace-file-watch-params'

vi.mock('../../src/main/runtime/file-watcher-host', () => ({
  watchFileExplorerInWatcherProcess: vi.fn<typeof watchFileExplorerInWatcherProcess>(
    async (root, callback, onError, signal) => {
      const watcher = await loadParcelWatcher()
      const subscription = await watcher.subscribe(root, (error, events) => {
        if (error) {
          onError?.(error)
        } else {
          callback(events.map((event) => ({ kind: event.type, absolutePath: event.path })))
        }
      })
      if (signal?.aborted) {
        await subscription.unsubscribe()
        signal.throwIfAborted()
      }
      return () => subscription.unsubscribe()
    }
  )
}))
import { watchFileExplorerInWatcherProcess } from '../../src/main/runtime/file-watcher-host'
let runtime: OrcaRuntimeService
let rendererClose: (() => Promise<void>) | undefined
let folder: string
let folderSelector: string
async function invoke(action: string, params: object) {
  const input = join(directory, 'watch-params.json')
  await writeFile(input, JSON.stringify(params))
  ctx.flags = new Map([['params-file', input]])
  await WORKSPACE_FILE_WATCH_HANDLERS[`file watch-${action}`](ctx)
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result
}
async function ready(worktree: string) {
  const request = await invoke('start', { worktree })
  await vi.waitFor(
    async () =>
      expect((await invoke('status', { requestId: request.requestId })).state).toBe('watching'),
    { timeout: 10_000 }
  )
  return request.requestId
}
beforeEach(async () => {
  vi.mocked(watchFileExplorerInWatcherProcess).mockClear()
  store.addRepo({
    id: 'git-fixture',
    path: source,
    displayName: 'Git',
    kind: 'git',
    badgeColor: 'blue',
    addedAt: 1
  })
  const parent = join(directory, 'folder-parent')
  await mkdir(parent)
  const repo = {
    id: 'folder-fixture',
    path: parent,
    displayName: 'Folder',
    kind: 'folder',
    badgeColor: 'blue',
    addedAt: 1
  } as const
  store.addRepo(repo)
  const workspace = createFolderWorkspace({ repoId: repo.id, name: 'child' }, repo, store).worktree
  folder = workspace.path
  folderSelector = `id:${workspace.id}`
  runtime = new OrcaRuntimeService(store)
  rendererClose = undefined
  const dispatcher = new RpcDispatcher({ runtime, methods: WORKSPACE_FILE_WATCH_METHODS })
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
afterEach(async () => {
  await disposeCliFileWatches()
  await rendererClose?.()
})
it.each(['git', 'folder'])(
  'observes actual native %s workspace changes through original authorized runtime/lease paths',
  async (kind) => {
    const root = kind === 'git' ? source : folder
    const selector = kind === 'git' ? `id:git-fixture::${source}` : folderSelector
    const requestId = await ready(selector)
    const file = join(root, 'cli-created.txt')
    await writeFile(file, 'private file content')
    await vi.waitFor(
      async () => {
        const status = await invoke('status', { requestId })
        expect(
          status.events.some((event: { absolutePath: string }) => event.absolutePath === file)
        ).toBe(true)
      },
      { timeout: 10_000 }
    )
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('private file content')
    expect(await invoke('stop', { requestId })).toMatchObject({
      state: 'stopped',
      cleanupPending: false
    })
    const sequence = (await invoke('status', { requestId })).sequence
    await writeFile(file, 'after stop')
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect((await invoke('status', { requestId })).sequence).toBe(sequence)
  }
)
it('releases only the CLI lease while a separate original runtime subscription keeps receiving changes', async () => {
  const rendererEvents: string[] = []
  rendererClose = await runtime.watchFileExplorer(folderSelector, (events) =>
    rendererEvents.push(...events.map((event) => event.absolutePath))
  )
  const requestId = await ready(folderSelector)
  await expect(
    invoke('stop', { requestId: '00000000-0000-4000-8000-000000000001' })
  ).rejects.toThrow('selector_not_found')
  await invoke('stop', { requestId })
  const file = join(folder, 'renderer-still-live.txt')
  await writeFile(file, 'sentinel')
  await vi.waitFor(() => expect(rendererEvents).toContain(file), { timeout: 10_000 })
  expect((await invoke('status', { requestId })).events).toEqual([])
})
it('rejects host/path and request authority without local substitution and preserves old-peer failures', async () => {
  const before = vi.mocked(watchFileExplorerInWatcherProcess).mock.calls.length
  for (const worktree of ['id:unknown::/foreign', 'id:unknown@ssh:foreign::/foreign']) {
    const request = await invoke('start', { worktree })
    await vi.waitFor(async () =>
      expect((await invoke('status', { requestId: request.requestId })).state).toBe('failed')
    )
  }
  expect(watchFileExplorerInWatcherProcess).toHaveBeenCalledTimes(before)
  expect(
    CliFileWatchStart.safeParse({ worktree: folderSelector, subscriptionId: 'renderer' }).success
  ).toBe(false)
  expect(CliFileWatchStatus.safeParse({ requestId: 'renderer', afterSequence: -1 }).success).toBe(
    false
  )
  vi.mocked(ctx.client.call).mockClear()
  await expect(
    invoke('start', { worktree: folderSelector, connectionId: 'foreign' })
  ).rejects.toThrow()
  expect(ctx.client.call).not.toHaveBeenCalled()
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'Old peer')
  )
  for (const action of ['start', 'status', 'stop']) {
    await expect(
      invoke(
        action,
        action === 'start'
          ? { worktree: folderSelector }
          : { requestId: '00000000-0000-4000-8000-000000000001' }
      )
    ).rejects.toMatchObject({ code: 'method_not_found' })
  }
})
