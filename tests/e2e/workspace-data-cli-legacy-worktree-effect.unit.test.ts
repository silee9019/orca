import {
  directory,
  source,
  destination,
  store,
  ctx,
  git,
  authority
} from './workspace-data-cli-remote-clone-fixture'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { beforeEach, expect, it, vi } from 'vitest'
import { WORKTREE_HANDLERS } from '../../src/cli/handlers/worktree'
import { WORKTREE_METHODS } from '../../src/main/runtime/rpc/methods/worktree'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClientError } from '../../src/cli/runtime-client'
let folder: string
async function invoke(action: string, flags: Record<string, string | boolean> = {}) {
  ctx.flags = new Map(Object.entries(flags))
  await WORKTREE_HANDLERS[`worktree ${action}`](ctx)
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result
}
beforeEach(async () => {
  await git(['worktree', 'add', '-b', 'fixture/child', destination], source)
  store.addRepo({
    id: 'git',
    path: source,
    displayName: 'Git',
    kind: 'git',
    badgeColor: 'blue',
    addedAt: 1,
    externalWorktreeVisibility: 'show'
  })
  folder = join(directory, 'folder')
  await mkdir(folder)
  await writeFile(join(folder, 'sentinel.txt'), 'private folder')
  store.addRepo({
    id: 'folder',
    path: folder,
    displayName: 'Folder',
    kind: 'folder',
    badgeColor: 'blue',
    addedAt: 1
  })
  const dispatcher = new RpcDispatcher({
    runtime: new OrcaRuntimeService(store),
    methods: WORKTREE_METHODS
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
it('lists actual Git worktrees and folder workspaces, filters repositories and shows the same identity', async () => {
  const result = await invoke('list')
  expect(result.worktrees).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ path: source, repoId: 'git', hostId: 'local' }),
      expect.objectContaining({ path: destination, repoId: 'git', hostId: 'local' }),
      expect.objectContaining({ path: folder, repoId: 'folder', hostId: 'local' })
    ])
  )
  const folders = (await invoke('list', { repo: 'folder' })).worktrees
  expect(folders).toHaveLength(1)
  expect((await invoke('show', { worktree: `id:${folders[0].id}` })).worktree.id).toBe(
    folders[0].id
  )
  await expect(invoke('show', { worktree: 'id:missing' })).rejects.toMatchObject({
    code: 'selector_not_found'
  })
})
it('resolves current from nested Git and folder paths without changing either workspace', async () => {
  for (const root of [destination, folder]) {
    const nested = join(root, 'nested')
    await mkdir(nested)
    ctx.cwd = nested
    const current = await invoke('current')
    expect(current.worktree.path).toBe(root)
  }
  expect(await readFile(join(folder, 'sentinel.txt'), 'utf8')).toBe('private folder')
})
it('persists display name, comment and unread metadata through the original host-scoped Store', async () => {
  const { worktrees } = await invoke('list', { repo: 'folder' })
  const id = worktrees[0].id
  await invoke('set', {
    worktree: `id:${id}`,
    'display-name': 'Renamed',
    comment: 'Fixture comment',
    unread: true
  })
  expect(store.getWorktreeMetaForHost(id, 'local')).toMatchObject({
    displayName: 'Renamed',
    comment: 'Fixture comment',
    isUnread: true
  })
  await store.flushPendingOrThrowAsync()
  expect(
    JSON.stringify(JSON.parse(authority.readSerializedState() ?? '{}').worktreeMeta)
  ).toContain('Renamed')
  expect((await invoke('show', { worktree: `id:${id}` })).worktree).toMatchObject({
    displayName: 'Renamed',
    comment: 'Fixture comment',
    isUnread: true
  })
  await expect(
    invoke('set', { worktree: `id:${id}`, 'parent-worktree': `id:${id}`, 'no-parent': true })
  ).rejects.toMatchObject({ code: 'invalid_argument' })
  expect(await readFile(join(folder, 'sentinel.txt'), 'utf8')).toBe('private folder')
})
it('projects an empty-agent private runtime through the original ps reader without spawning terminals', async () => {
  const result = await invoke('ps', { limit: '10' })
  expect(JSON.stringify(result)).toContain('Folder')
  expect(store.getRepos()).toHaveLength(2)
  await expect(invoke('ps', { limit: '0' })).rejects.toMatchObject({ code: 'invalid_argument' })
})
it('keeps an unavailable old peer explicit instead of reading the client filesystem', async () => {
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'Old peer')
  )
  await expect(invoke('list')).rejects.toMatchObject({ code: 'method_not_found' })
  await expect(invoke('ps')).rejects.toMatchObject({ code: 'method_not_found' })
})
