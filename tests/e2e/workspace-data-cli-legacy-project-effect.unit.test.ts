import {
  directory,
  source,
  destination,
  url,
  store,
  ctx,
  git,
  authority
} from './workspace-data-cli-remote-clone-fixture'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PROJECT_HANDLERS } from '../../src/cli/handlers/project'
import { REPO_METHODS } from '../../src/main/runtime/rpc/methods/repo'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClientError } from '../../src/cli/runtime-client'
import { SSH_METHODS } from '../../src/main/runtime/rpc/methods/ssh'
import { SshConnectionStore } from '../../src/main/ssh/ssh-connection-store'
import { setSshTargetRegistryStore } from '../../src/main/ssh/ssh-target-registry'
let projectId: string
afterEach(() => setSshTargetRegistryStore(null))
async function invoke(action: string, flags: Record<string, string> = {}) {
  ctx.flags = new Map(Object.entries(flags))
  await PROJECT_HANDLERS[`project ${action}`](ctx)
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result
}
beforeEach(() => {
  store.addRepo({
    id: 'project-root',
    path: source,
    displayName: 'Fixture',
    kind: 'git',
    badgeColor: 'blue',
    addedAt: 1,
    upstream: { owner: 'fixture', repo: 'project' }
  })
  store.addSshTarget({
    id: 'fixture-metadata',
    label: 'Metadata fixture',
    host: 'fixture.invalid',
    port: 22,
    username: 'fixture',
    source: 'manual'
  })
  setSshTargetRegistryStore(new SshConnectionStore(store))
  const runtime = new OrcaRuntimeService(store)
  projectId = runtime.listProjects()[0].id
  const dispatcher = new RpcDispatcher({ runtime, methods: [...REPO_METHODS, ...SSH_METHODS] })
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
it('lists original project/setup records and applies both project and host filters', async () => {
  expect((await invoke('list')).projects).toEqual([expect.objectContaining({ id: projectId })])
  const setups = await invoke('setups', { project: projectId, host: 'local' })
  expect(setups.setups).toHaveLength(1)
  expect(setups.setups[0]).toMatchObject({ projectId, hostId: 'local', path: source })
  expect((await invoke('setups', { project: 'missing', host: 'local' })).setups).toEqual([])
})
it('durably creates, updates and deletes independent metadata with exact confirmation', async () => {
  const { result: created } = await invoke('setup-create', {
    project: projectId,
    host: 'ssh:fixture-metadata',
    'setup-id': 'independent-metadata',
    path: '/fixture/metadata',
    state: 'not-set-up',
    'display-name': 'Metadata only'
  })
  expect(created.setup).toMatchObject({
    id: 'independent-metadata',
    projectId,
    repoId: '',
    setupState: 'not-set-up'
  })
  expect(store.getRepos()).toHaveLength(1)
  await invoke('setup-update', {
    setup: created.setup.id,
    'display-name': 'Renamed',
    state: 'error'
  })
  await store.flushPendingOrThrowAsync()
  const persisted = JSON.parse(authority.readSerializedState() ?? '{}').projectHostSetups.find(
    (value: { id: string }) => value.id === created.setup.id
  )
  expect(persisted).toMatchObject({ displayName: 'Renamed', setupState: 'error' })
  await expect(
    invoke('setup-delete', { setup: created.setup.id, confirm: 'wrong' })
  ).rejects.toThrow()
  expect(store.getProjectHostSetups().some((setup) => setup.id === created.setup.id)).toBe(true)
  await invoke('setup-delete', { setup: created.setup.id, confirm: created.setup.id })
  await store.flushPendingOrThrowAsync()
  expect(store.getProjectHostSetups().some((setup) => setup.id === created.setup.id)).toBe(false)
  expect(store.getRepos()).toHaveLength(1)
})
it('links an actual native folder through the original registration service without changing its file', async () => {
  const folder = join(directory, 'project-folder')
  await mkdir(folder)
  await writeFile(join(folder, 'sentinel.txt'), 'private folder content')
  const { result } = await invoke('setup-existing-folder', {
    project: projectId,
    host: 'local',
    path: folder,
    kind: 'folder'
  })
  expect(result.project.id).toBe(projectId)
  expect(result.repo).toMatchObject({ path: folder, kind: 'folder' })
  expect(result.setup).toMatchObject({ projectId, setupMethod: 'imported-existing-folder' })
  await store.flushPendingOrThrowAsync()
  expect(store.getRepo(result.repo.id)?.path).toBe(folder)
  expect(await readFile(join(folder, 'sentinel.txt'), 'utf8')).toBe('private folder content')
})
it('clones a private file URL into a real checkout and links its original project identity', async () => {
  const head = (await git(['rev-parse', 'HEAD'], source)).stdout.trim()
  const { result } = await invoke('setup-clone', {
    project: projectId,
    host: 'local',
    url,
    destination
  })
  expect(result.project.id).toBe(projectId)
  expect(result.repo).toMatchObject({ path: join(destination, 'source'), kind: 'git' })
  expect(result.setup).toMatchObject({ projectId, setupMethod: 'cloned' })
  expect((await git(['rev-parse', 'HEAD'], result.repo.path)).stdout.trim()).toBe(head)
  await store.flushPendingOrThrowAsync()
  expect(store.getRepo(result.repo.id)?.path).toBe(join(destination, 'source'))
})
it('rejects off-client relative paths and translates an old setup peer explicitly', async () => {
  await expect(
    invoke('setup-existing-folder', {
      project: projectId,
      host: 'ssh:fixture-metadata',
      path: 'relative',
      kind: 'folder'
    })
  ).rejects.toMatchObject({ code: 'invalid_argument' })
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'Old peer')
  )
  await expect(invoke('setups')).rejects.toMatchObject({ code: 'incompatible_runtime' })
})
