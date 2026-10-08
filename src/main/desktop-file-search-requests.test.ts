import './runtime/rpc/unused-default-rpc-methods.test-fixture'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { IFilesystemProvider } from './providers/types'
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))
vi.mock('./ssh/ssh-config-parser', () => ({
  loadUserSshConfig: () => ({ hosts: [] }),
  sshConfigHostsToTargets: () => []
}))
vi.mock('./providers/ssh-filesystem-dispatch', () => ({
  getSshFilesystemProvider: (id: string) => (id === 'file-search-fixture' ? provider : undefined)
}))
import * as appEnvironment from '../shared/app-environment'
import { Store } from './persistence'
import { ProfileStateSqliteAuthority } from './persistence/profile-state/profile-state-sqlite-authority'
import { OrcaRuntimeService } from './runtime/orca-runtime'
import { RpcDispatcher } from './runtime/rpc/dispatcher'
import {
  WORKSPACE_FILE_SEARCH_METHODS,
  setDesktopFileSearchForRpc
} from './runtime/rpc/methods/workspace-file-search'
import { registerDesktopFileSearchForRpc } from './desktop-file-search-requests'
import { z } from 'zod'
import { createWorktreeIdentity } from '../shared/worktree/identity'
import { setSshConnectionGeneration } from './ssh/ssh-connection-generation'
class SearchRuntime extends OrcaRuntimeService {
  fileTarget?: Awaited<ReturnType<OrcaRuntimeService['showManagedWorktree']>>
  protected override async resolveRuntimeFileTarget(selector: string) {
    if (!this.fileTarget || selector !== `identity:${this.fileTarget.identity?.key}`) {
      throw new Error('Unexpected fixture file selector')
    }
    return { worktree: this.fileTarget, executionHostId: 'ssh:file-search-fixture' as const }
  }
}
let provider: Pick<IFilesystemProvider, 'search'> | undefined
let directory: string,
  store: Store,
  authority: ProfileStateSqliteAuthority,
  runtime: SearchRuntime,
  dispatcher: RpcDispatcher
let target: { worktreeId: string; executionHostId: 'ssh:file-search-fixture'; identityKey: string }
async function invoke(action: string, params: object) {
  const response = await dispatcher.dispatch({
    id: 'fixture',
    authToken: 'fixture',
    method: `files.desktopSearch${action}`,
    params: { expectedExecutionHostId: 'local', ...params }
  })
  if (!response.ok) {
    throw new Error(`${response.error.code}:${response.error.message}`)
  }
  return response.result
}
async function start() {
  return z
    .object({ requestId: z.string().uuid() })
    .parse(await invoke('Start', { target, query: 'fixture' }))
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-file-search-ssh-'))
  vi.spyOn(appEnvironment, 'getAppEnvironment').mockReturnValue({
    getPath: () => directory,
    getAppPath: () => directory,
    getVersion: () => 'fixture',
    isPackaged: () => false,
    onWillQuit: () => {},
    exit: () => {},
    getAppMetrics: () => []
  })
  authority = new ProfileStateSqliteAuthority(join(directory, 'profile.db'), 'fixture')
  vi.spyOn(authority, 'scheduleBackup').mockImplementation(() => {})
  store = new Store({ dataFile: join(directory, 'data.json'), profileStateAuthority: authority })
  const root = join(directory, 'folder')
  await mkdir(root)
  store.addRepo({
    id: 'local',
    path: root,
    kind: 'folder',
    displayName: 'Local',
    badgeColor: 'blue',
    addedAt: 1
  })
  store.addRepo({
    id: 'remote',
    path: root,
    connectionId: 'file-search-fixture',
    executionHostId: 'ssh:file-search-fixture',
    displayName: 'Remote',
    badgeColor: 'blue',
    addedAt: 1
  })
  runtime = new SearchRuntime(store)
  const local = await runtime.showManagedWorktree(`path:${root}`)
  const identity = createWorktreeIdentity({
    worktreeId: 'remote::fixture',
    executionHostId: 'ssh:file-search-fixture',
    instanceId: 'fixture-instance'
  })
  target = {
    worktreeId: 'remote::fixture',
    executionHostId: 'ssh:file-search-fixture',
    identityKey: identity.key
  }
  runtime.fileTarget = {
    ...local,
    id: target.worktreeId,
    repoId: 'remote',
    hostId: target.executionHostId,
    instanceId: 'fixture-instance',
    identity
  }
  vi.spyOn(runtime, 'showManagedWorktree').mockResolvedValue(runtime.fileTarget)
  provider = { search: vi.fn(async () => searchResult) }
  registerDesktopFileSearchForRpc(store)
  dispatcher = new RpcDispatcher({ runtime, methods: WORKSPACE_FILE_SEARCH_METHODS })
})
afterEach(async () => {
  setDesktopFileSearchForRpc(null)
  provider = undefined
  await store?.freezeWritesAsync()
  authority?.close()
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})
const searchResult = {
  files: [
    {
      filePath: '/fixture/remote.txt',
      relativePath: 'remote.txt',
      matches: [{ line: 1, column: 1, matchLength: 7, lineContent: 'fixture' }]
    }
  ],
  totalMatches: 1,
  truncated: false
}
it('propagates cancellation through the original runtime/provider search and keeps the slot until settlement', async () => {
  let finish: (value: typeof searchResult) => void = () => {}
  let signal: AbortSignal | undefined
  const search = vi.fn(
    async (
      _options: Parameters<IFilesystemProvider['search']>[0],
      options?: Parameters<IFilesystemProvider['search']>[1]
    ) => {
      signal = options?.signal
      return new Promise<typeof searchResult>((resolve) => {
        finish = resolve
      })
    }
  )
  provider = { search }
  const request = await start()
  await vi.waitFor(() => expect(search).toHaveBeenCalledOnce())
  expect(await invoke('Cancel', request)).toMatchObject({
    state: 'cancel_requested',
    executionVerdict: 'unverifiable'
  })
  expect(signal?.aborted).toBe(true)
  await expect(start()).rejects.toThrow('desktop_file_search_busy')
  finish(searchResult)
  await vi.waitFor(async () =>
    expect(await invoke('Status', request)).toMatchObject({ state: 'cancelled' })
  )
  await expect(invoke('Result', request)).rejects.toThrow()
})
it('refuses disconnected providers without client/local fallback', async () => {
  provider = undefined
  const request = await start()
  await vi.waitFor(async () =>
    expect(await invoke('Status', request)).toMatchObject({ state: 'failed' })
  )
})
it('discards results after provider generation and owner changes', async () => {
  provider = {
    search: vi.fn(async () => {
      setSshConnectionGeneration('file-search-fixture', 5555)
      return searchResult
    })
  }
  let request = await start()
  await vi.waitFor(async () =>
    expect(await invoke('Status', request)).toMatchObject({ state: 'failed' })
  )
  await expect(invoke('Result', request)).rejects.toThrow()
  expect(provider.search).toHaveBeenCalledOnce()
  provider = {
    search: vi.fn(async () => {
      store.updateRepo('remote', { executionHostId: 'ssh:file-search-fixture-changed' })
      return searchResult
    })
  }
  request = await start()
  await vi.waitFor(async () =>
    expect(await invoke('Status', request)).toMatchObject({ state: 'failed' })
  )
  expect(provider.search).toHaveBeenCalledOnce()
})

it('returns results through the original runtime and typed selected-host provider', async () => {
  const request = await start()
  await vi.waitFor(async () =>
    expect(await invoke('Status', request)).toMatchObject({ state: 'completed' })
  )
  expect(provider?.search).toHaveBeenCalledOnce()
  expect(await invoke('Result', request)).toMatchObject({
    totalMatches: 1,
    files: [{ relativePath: 'remote.txt' }]
  })
})
