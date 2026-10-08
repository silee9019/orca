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
  getSshFilesystemProvider: (id: string) => (id === 'file-list-fixture' ? provider : undefined)
}))
import * as appEnvironment from '../shared/app-environment'
import { Store } from './persistence'
import { ProfileStateSqliteAuthority } from './persistence/profile-state/profile-state-sqlite-authority'
import { OrcaRuntimeService } from './runtime/orca-runtime'
import { RpcDispatcher } from './runtime/rpc/dispatcher'
import {
  WORKSPACE_FILE_LIST_METHODS,
  setDesktopFileListForRpc
} from './runtime/rpc/methods/workspace-file-list'
import { registerDesktopFileListForRpc } from './desktop-file-list-requests'
import { z } from 'zod'
import { createWorktreeIdentity } from '../shared/worktree/identity'
import { listDesktopFiles } from './desktop-file-listing'
import { setSshConnectionGeneration } from './ssh/ssh-connection-generation'
let provider: Pick<IFilesystemProvider, 'listFiles' | 'supportsQuickOpenSearch'> | undefined
let directory: string,
  store: Store,
  authority: ProfileStateSqliteAuthority,
  runtime: OrcaRuntimeService,
  dispatcher: RpcDispatcher
let target: { worktreeId: string; executionHostId: 'ssh:file-list-fixture'; identityKey: string }
async function invoke(action: string, params: object) {
  const response = await dispatcher.dispatch({
    id: 'fixture',
    authToken: 'fixture',
    method: `files.desktopList${action}`,
    params: { expectedExecutionHostId: 'local', ...params }
  })
  if (!response.ok) {
    throw new Error(`${response.error.code}:${response.error.message}`)
  }
  return response.result
}
async function start() {
  return z.object({ requestId: z.string().uuid() }).parse(await invoke('Start', { target }))
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-file-list-ssh-'))
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
    connectionId: 'file-list-fixture',
    executionHostId: 'ssh:file-list-fixture',
    displayName: 'Remote',
    badgeColor: 'blue',
    addedAt: 1
  })
  runtime = new OrcaRuntimeService(store)
  const local = await runtime.showManagedWorktree(`path:${root}`)
  const identity = createWorktreeIdentity({
    worktreeId: 'remote::fixture',
    executionHostId: 'ssh:file-list-fixture',
    instanceId: 'fixture-instance'
  })
  target = {
    worktreeId: 'remote::fixture',
    executionHostId: 'ssh:file-list-fixture',
    identityKey: identity.key
  }
  vi.spyOn(runtime, 'showManagedWorktree').mockResolvedValue({
    ...local,
    id: target.worktreeId,
    repoId: 'remote',
    hostId: target.executionHostId,
    instanceId: 'fixture-instance',
    identity
  })
  provider = {
    listFiles: vi.fn(async () => ['remote.txt']),
    supportsQuickOpenSearch: vi.fn(async () => true)
  }
  registerDesktopFileListForRpc(store)
  dispatcher = new RpcDispatcher({ runtime, methods: WORKSPACE_FILE_LIST_METHODS })
})
afterEach(async () => {
  setDesktopFileListForRpc(null)
  provider = undefined
  await store?.freezeWritesAsync()
  authority?.close()
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})
it('propagates cancellation to only the CLI provider request and keeps the slot until settlement', async () => {
  let finish: (files: string[]) => void = () => {}
  let signal: AbortSignal | undefined
  const list = vi.fn(
    async (_root: string, options?: Parameters<IFilesystemProvider['listFiles']>[1]) => {
      signal = options?.signal
      return new Promise<string[]>((resolve) => {
        finish = resolve
      })
    }
  )
  provider = { listFiles: list, supportsQuickOpenSearch: async () => true }
  const request = await start()
  await vi.waitFor(() => expect(list).toHaveBeenCalledOnce())
  expect(await invoke('Cancel', request)).toMatchObject({
    state: 'cancel_requested',
    executionVerdict: 'unverifiable'
  })
  expect(signal?.aborted).toBe(true)
  await expect(start()).rejects.toThrow('desktop_file_list_busy')
  finish(['discard.txt'])
  await vi.waitFor(async () =>
    expect(await invoke('Status', request)).toMatchObject({ state: 'cancelled' })
  )
  await expect(invoke('Result', request)).rejects.toThrow()
})
it('refuses disconnected providers while preserving the original UI empty-list fallback', async () => {
  provider = undefined
  const request = await start()
  await vi.waitFor(async () =>
    expect(await invoke('Status', request)).toMatchObject({ state: 'failed' })
  )
  expect(
    await listDesktopFiles(store, { rootPath: directory, connectionId: 'file-list-fixture' })
  ).toEqual([])
})
it('discards results after SSH generation or workspace identity changes and refuses old capabilities', async () => {
  provider = {
    supportsQuickOpenSearch: async () => true,
    listFiles: async () => {
      setSshConnectionGeneration('file-list-fixture', 991)
      return ['must-not-leak.txt']
    }
  }
  let request = await start()
  await vi.waitFor(async () =>
    expect(await invoke('Status', request)).toMatchObject({ state: 'failed' })
  )
  await expect(invoke('Result', request)).rejects.toThrow()
  provider = {
    supportsQuickOpenSearch: async () => true,
    listFiles: async () => {
      store.updateRepo('remote', { executionHostId: 'ssh:file-list-fixture-changed' })
      return ['discard-identity.txt']
    }
  }
  request = await start()
  await vi.waitFor(async () =>
    expect(await invoke('Status', request)).toMatchObject({ state: 'failed' })
  )
  store.updateRepo('remote', { executionHostId: 'ssh:file-list-fixture' })
  provider = {
    supportsQuickOpenSearch: async () => false,
    listFiles: vi.fn(async () => ['old.txt'])
  }
  request = await start()
  await vi.waitFor(async () =>
    expect(await invoke('Status', request)).toMatchObject({ state: 'failed' })
  )
  expect(provider.listFiles).not.toHaveBeenCalled()
})
