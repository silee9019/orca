import {
  directory,
  source,
  destination,
  url,
  store,
  window,
  ctx,
  git,
  setCloneSpawn
} from './workspace-data-cli-remote-clone-fixture'
import { access, writeFile, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ChildProcess } from 'node:child_process'
import { spawnProcess } from '../../src/shared/child-process/run-process'
import { readProfileStateDomain } from '../../src/main/persistence/profile-state/profile-state-domain-reader'
import * as icons from '../../src/main/repo-icon-autodetect'
import { cloneLocalRepo } from '../../src/main/desktop-local-clone'
import { abortRendererLocalClone } from '../../src/main/desktop-local-clone-lifecycle'
import { WORKSPACE_LOCAL_CLONE_HANDLERS } from '../../src/cli/handlers/workspace-local-clone'
import {
  WORKSPACE_LOCAL_CLONE_METHODS,
  setDesktopLocalCloneForRpc
} from '../../src/main/runtime/rpc/methods/workspace-local-clone'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClientError } from '../../src/cli/runtime-client'
const children: ChildProcess[] = []
async function invoke(action: string, params: object, confirm = `local:${destination}`) {
  const input = join(directory, 'local-params.json')
  await writeFile(input, JSON.stringify({ expectedExecutionHostId: 'local', ...params }))
  ctx.flags = new Map([
    ['params-file', input],
    ['confirm', confirm]
  ])
  await WORKSPACE_LOCAL_CLONE_HANDLERS[`repo clone-desktop-local-${action}`](ctx)
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result
}
function start() {
  return invoke('start', { expectedCloneHostId: 'local', url, destination })
}
async function wait(requestId: string, state: string) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const current = await invoke('status', { requestId })
    if (current.state === state) {
      return
    }
    if (['completed', 'failed', 'cancelled'].includes(current.state)) {
      throw new Error(`Unexpected clone state: ${current.state}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('Clone did not settle')
}
beforeEach(() => {
  store.updateSettings({ workspaceDir: join(directory, 'workspaces') })
  const dispatcher = new RpcDispatcher({
    runtime: new OrcaRuntimeService(store),
    methods: WORKSPACE_LOCAL_CLONE_METHODS
  })
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
  setDesktopLocalCloneForRpc(null)
  abortRendererLocalClone()
  await Promise.all(
    children.splice(0).map(async (child) => {
      if (child.exitCode === null && child.signalCode === null) {
        await new Promise<void>((resolve) => {
          child.once('close', () => resolve())
          child.kill()
        })
      }
    })
  )
})
it('runs the original native Git clone and saves the registration before receipt', async () => {
  const request = await start()
  await wait(request.requestId, 'completed')
  const result = await invoke('result', { requestId: request.requestId })
  expect(result).toMatchObject({
    path: join(destination, 'source'),
    executionHostId: 'local',
    kind: 'git'
  })
  expect((await git(['rev-parse', 'HEAD'], result.path)).stdout).toBe(
    (await git(['rev-parse', 'HEAD'], source)).stdout
  )
  expect(
    JSON.stringify(readProfileStateDomain(join(directory, 'profile.db'), 'fixture', 'repos'))
  ).toContain(result.repoId)
  const repeat = await start()
  await wait(repeat.requestId, 'completed')
  expect((await invoke('result', { requestId: repeat.requestId })).repoId).toBe(result.repoId)
  expect(store.getRepos()).toHaveLength(1)
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain(url)
})
it('upgrades the original folder registration while preserving its identity and badge', async () => {
  store.addRepo({
    id: 'folder',
    path: join(destination, 'source'),
    displayName: 'Folder',
    kind: 'folder',
    badgeColor: 'blue',
    addedAt: 1
  })
  const request = await start()
  await wait(request.requestId, 'completed')
  expect((await invoke('result', { requestId: request.requestId })).repoId).toBe('folder')
  expect(store.getRepos()[0]).toMatchObject({
    kind: 'git',
    badgeColor: 'blue',
    projectHostSetupMethod: 'cloned'
  })
})
it('separates CLI process cancellation from renderer abort and performs original claimed cleanup', async () => {
  setCloneSpawn(async () => {
    const child = spawnProcess({
      program: process.execPath,
      args: ['-e', "process.stderr.write('Receiving objects: 42%\\r');setInterval(()=>{},1000)"],
      cwd: directory
    })
    children.push(child)
    return child
  })
  const request = await start()
  await vi.waitFor(() => expect(children).toHaveLength(1))
  const renderer = cloneLocalRepo(store, window, { url, destination: join(directory, 'renderer') })
  const rejectedRenderer = expect(renderer).rejects.toThrow()
  await vi.waitFor(() => expect(children).toHaveLength(2))
  abortRendererLocalClone()
  await rejectedRenderer
  expect(children[0].exitCode).toBeNull()
  expect(children[0].signalCode).toBeNull()
  expect((await invoke('cancel', { requestId: request.requestId })).state).toBe('cancel_requested')
  await wait(request.requestId, 'cancelled')
  await expect(access(join(destination, 'source'))).rejects.toThrow()
  expect(store.getRepos()).toEqual([])
  expect((await invoke('status', { requestId: request.requestId })).executionVerdict).toBe(
    'unverifiable'
  )
})
it('cancels during original runner preparation without touching an existing target', async () => {
  let entered = false
  let release: (() => void) | undefined
  setCloneSpawn(async (_args, options) => {
    entered = true
    await new Promise<void>((resolve) => {
      release = resolve
    })
    options.signal?.throwIfAborted()
    throw new Error('Unexpected preparation success')
  })
  const target = join(destination, 'source')
  await mkdir(target, { recursive: true })
  await writeFile(join(target, 'sentinel.txt'), 'preserved')
  const request = await start()
  await vi.waitFor(() => expect(entered).toBe(true))
  await invoke('cancel', { requestId: request.requestId })
  release?.()
  await wait(request.requestId, 'cancelled')
  expect(await readFile(join(target, 'sentinel.txt'), 'utf8')).toBe('preserved')
  expect(store.getRepos()).toEqual([])
})
it('blocks late Store writes after icon detection when cancelled and preserves the completed checkout', async () => {
  let entered = false
  let release: (() => void) | undefined
  vi.spyOn(icons, 'detectRepoIconAndUpstream').mockImplementationOnce(async () => {
    entered = true
    await new Promise<void>((resolve) => {
      release = resolve
    })
    return {}
  })
  const request = await start()
  await vi.waitFor(() => expect(entered).toBe(true))
  await invoke('cancel', { requestId: request.requestId })
  release?.()
  await wait(request.requestId, 'cancelled')
  await access(join(destination, 'source', '.git'))
  expect(store.getRepos()).toEqual([])
})
it('refuses wrong ownership, caller controllers, WSL destinations, confirmation and old peers', async () => {
  await expect(
    invoke('start', { expectedCloneHostId: 'local', url, destination }, 'wrong')
  ).rejects.toThrow()
  for (const extra of [
    { controller: {} },
    { expectedCloneHostId: 'ssh:foreign' },
    { destination: '//wsl.localhost/Ubuntu/home/fixture' }
  ]) {
    await expect(
      invoke('start', { expectedCloneHostId: 'local', url, destination, ...extra })
    ).rejects.toThrow()
  }
  store.addRepo({
    id: 'foreign',
    path: join(destination, 'source'),
    displayName: 'Foreign',
    kind: 'git',
    executionHostId: 'ssh:foreign',
    badgeColor: 'blue',
    addedAt: 1
  })
  const request = await start()
  await wait(request.requestId, 'failed')
  await expect(access(destination)).rejects.toThrow()
  setDesktopLocalCloneForRpc(null)
  await expect(start()).rejects.toMatchObject({ code: 'runtime_unavailable' })
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'Old peer')
  )
  await expect(start()).rejects.toMatchObject({ code: 'method_not_found' })
})
it('rechecks native ownership after icon detection without replacing a foreign registration', async () => {
  let entered = false
  let release: (() => void) | undefined
  vi.spyOn(icons, 'detectRepoIconAndUpstream').mockImplementationOnce(async () => {
    entered = true
    await new Promise<void>((resolve) => {
      release = resolve
    })
    return {}
  })
  const request = await start()
  await vi.waitFor(() => expect(entered).toBe(true))
  store.addRepo({
    id: 'late-foreign',
    path: join(destination, 'source'),
    displayName: 'Foreign',
    kind: 'git',
    executionHostId: 'ssh:foreign',
    badgeColor: 'blue',
    addedAt: 1
  })
  release?.()
  await wait(request.requestId, 'failed')
  expect(store.getRepos().map((repo) => repo.id)).toEqual(['late-foreign'])
  await access(join(destination, 'source', '.git'))
})
it('withholds receipts on save failure without claiming metadata or checkout rollback', async () => {
  vi.spyOn(store, 'flushPendingOrThrowAsync').mockRejectedValueOnce(
    new Error('private save credential')
  )
  const request = await start()
  await wait(request.requestId, 'failed')
  expect(store.getRepos()).toHaveLength(1)
  await access(join(destination, 'source', '.git'))
  await expect(invoke('result', { requestId: request.requestId })).rejects.toThrow()
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('private save credential')
})
