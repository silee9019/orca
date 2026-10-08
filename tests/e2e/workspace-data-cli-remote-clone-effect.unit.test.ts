import {
  directory,
  destination,
  url,
  store,
  window,
  ctx,
  gitProvider,
  git,
  invoke,
  start,
  wait,
  getCloneOperation,
  setCloneOperation,
  getProbe,
  setProbe,
  changeGeneration,
  setDestination,
  disconnect
} from './workspace-data-cli-remote-clone-fixture'
import { readProfileStateDomain } from '../../src/main/persistence/profile-state/profile-state-domain-reader'
import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { DesktopRemoteCloneStart } from '../../src/shared/rpc-contract/workspace-remote-clone-params'
import { cloneRemoteRepo, abortActiveRemoteClone } from '../../src/main/ipc/repos/remote-repo-clone'
import { setDesktopRemoteCloneForRpc } from '../../src/main/runtime/rpc/methods/workspace-remote-clone'
import { RuntimeClientError } from '../../src/cli/runtime-client'
it('clones a real private file URL through the original SSH service and persists registration before result', async () => {
  const request = await start()
  await wait(request.requestId, 'completed')
  const receipt = await invoke('result', { requestId: request.requestId })
  expect(receipt).toMatchObject({
    path: join(destination, 'source'),
    executionHostId: 'ssh:clone-fixture',
    kind: 'git'
  })
  expect(await git(['rev-parse', 'HEAD'], receipt.path)).toMatchObject({ code: 0 })
  expect(
    JSON.stringify(readProfileStateDomain(join(directory, 'profile.db'), 'fixture', 'repos'))
  ).toContain(receipt.repoId)
  expect((await invoke('status', { requestId: request.requestId })).percent).toBe(42)
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain(url)
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('private progress phase')
  expect(window.webContents.send).not.toHaveBeenCalledWith(
    'repos:clone-progress',
    expect.anything()
  )
})
it('upgrades a folder registration and reuses an existing Git registration without cloning again', async () => {
  store.addRepo({
    id: 'folder',
    path: join(destination, 'source'),
    displayName: 'Folder',
    kind: 'folder',
    connectionId: 'clone-fixture',
    executionHostId: 'ssh:clone-fixture',
    badgeColor: 'blue',
    addedAt: 1
  })
  let request = await start()
  await wait(request.requestId, 'completed')
  expect((await invoke('result', { requestId: request.requestId })).repoId).toBe('folder')
  expect(store.getRepos()[0].kind).toBe('git')
  request = await start()
  await wait(request.requestId, 'completed')
  expect((await invoke('result', { requestId: request.requestId })).repoId).toBe('folder')
  expect(gitProvider.clone).toHaveBeenCalledOnce()
})
it('separates renderer abort from CLI cancellation and rejects same-destination concurrent work', async () => {
  type Pending = { signal?: AbortSignal; finish: () => void }
  const pending: Pending[] = []
  setCloneOperation(
    async (_args, _cwd, options) =>
      new Promise((resolve) => {
        pending.push({ signal: options?.signal, finish: () => resolve({ stdout: '', stderr: '' }) })
      })
  )
  const request = await start()
  await vi.waitFor(() => expect(pending).toHaveLength(1))
  await expect(start()).rejects.toThrow()
  await expect(
    cloneRemoteRepo(store, window, { connectionId: 'clone-fixture', url, destination })
  ).rejects.toThrow('already in progress')
  const ui = cloneRemoteRepo(store, window, {
    connectionId: 'clone-fixture',
    url,
    destination: join(directory, 'renderer')
  })
  await vi.waitFor(() => expect(pending).toHaveLength(2))
  abortActiveRemoteClone()
  expect(pending[1].signal?.aborted).toBe(true)
  expect(pending[0].signal?.aborted).toBe(false)
  pending[1].finish()
  await expect(ui).rejects.toThrow()
  expect((await invoke('cancel', { requestId: request.requestId })).state).toBe('cancel_requested')
  expect(pending[0].signal?.aborted).toBe(true)
  pending[0].finish()
  await wait(request.requestId, 'cancelled')
  expect(store.getRepos()).toEqual([])
})
it('refuses provider generation changes before registration while preserving the partial checkout', async () => {
  const original = getCloneOperation()
  setCloneOperation(async (...args) => {
    const value = await original(...args)
    changeGeneration()
    return value
  })
  const request = await start()
  await wait(request.requestId, 'failed')
  await access(join(destination, 'source', '.git'))
  expect(store.getRepos()).toEqual([])
  await expect(invoke('result', { requestId: request.requestId })).rejects.toThrow()
})
it('rechecks authority after registration probes and refuses raw save errors without rollback claims', async () => {
  const original = getProbe()
  setProbe(async (path) => {
    const value = await original(path)
    changeGeneration()
    return value
  })
  let request = await start()
  await wait(request.requestId, 'failed')
  expect(store.getRepos()).toEqual([])
  setDestination(join(directory, 'save-failure'))
  setProbe(original)
  vi.spyOn(store, 'flushPendingOrThrowAsync').mockRejectedValueOnce(new Error('private save token'))
  request = await start()
  await wait(request.requestId, 'failed')
  expect(store.getRepos()).toHaveLength(1)
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('private save token')
})
it('rejects caller authority/confirmation and explicitly fails disconnected service and old peers', async () => {
  for (const extra of [{ controller: {} }, { connectionId: 'foreign' }, { destination: '~' }]) {
    expect(
      DesktopRemoteCloneStart.safeParse({
        expectedExecutionHostId: 'local',
        expectedCloneHostId: 'ssh:clone-fixture',
        url,
        destination,
        ...extra
      }).success
    ).toBe(false)
  }
  await expect(
    invoke('start', { expectedCloneHostId: 'ssh:clone-fixture', url, destination }, 'wrong')
  ).rejects.toThrow()
  expect(gitProvider.clone).not.toHaveBeenCalled()
  disconnect()
  const request = await start()
  await wait(request.requestId, 'failed')
  setDesktopRemoteCloneForRpc(null)
  await expect(start()).rejects.toMatchObject({ code: 'runtime_unavailable' })
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'Old peer')
  )
  await expect(start()).rejects.toMatchObject({ code: 'method_not_found' })
})
