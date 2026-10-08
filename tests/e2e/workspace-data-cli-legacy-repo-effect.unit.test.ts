import {
  directory,
  source,
  store,
  ctx,
  git,
  authority
} from './workspace-data-cli-remote-clone-fixture'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { beforeEach, expect, it, vi } from 'vitest'
import { REPO_HANDLERS } from '../../src/cli/handlers/repo'
import { REPO_METHODS } from '../../src/main/runtime/rpc/methods/repo'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClientError } from '../../src/cli/runtime-client'
let runtime: OrcaRuntimeService
async function invoke(action: string, flags: Record<string, string> = {}) {
  ctx.flags = new Map(Object.entries(flags))
  await REPO_HANDLERS[`repo ${action}`](ctx)
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result
}
beforeEach(() => {
  runtime = new OrcaRuntimeService(store)
  const dispatcher = new RpcDispatcher({ runtime, methods: REPO_METHODS })
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
it('adds an actual private Git checkout once and lists/shows its same catalog record', async () => {
  await writeFile(join(source, 'sentinel.txt'), 'private sentinel')
  const added = await invoke('add', { path: source })
  expect(added.repo).toMatchObject({ path: source, kind: 'git' })
  expect(store.getRepos()).toHaveLength(1)
  expect((await invoke('add', { path: source })).repo.id).toBe(added.repo.id)
  expect(store.getRepos()).toHaveLength(1)
  expect((await invoke('list')).repos).toEqual([
    expect.objectContaining({ id: added.repo.id, path: source })
  ])
  expect((await invoke('show', { repo: added.repo.id })).repo.id).toBe(added.repo.id)
  await store.flushPendingOrThrowAsync()
  expect(await readFile(join(source, 'sentinel.txt'), 'utf8')).toBe('private sentinel')
})
it('applies show/hide/inherit visibility through the original settings service', async () => {
  const { repo } = await invoke('add', { path: source })
  for (const visibility of ['show', 'hide', 'inherit']) {
    await invoke('set', { repo: repo.id, 'external-worktree-visibility': visibility })
    expect(store.getRepo(repo.id)?.externalWorktreeVisibility).toBe(
      visibility === 'inherit' ? undefined : visibility
    )
    await store.flushPendingOrThrowAsync()
    const persisted = JSON.parse(authority.readSerializedState() ?? '{}').repos.find(
      (value: { id: string }) => value.id === repo.id
    )
    expect(persisted.externalWorktreeVisibility).toBe(
      visibility === 'inherit' ? undefined : visibility
    )
  }
  await expect(
    invoke('set', { repo: repo.id, 'external-worktree-visibility': 'unknown' })
  ).rejects.toMatchObject({ code: 'invalid_argument' })
})
it('stores the selected base ref and searches real Git refs without changing the checkout', async () => {
  const { repo } = await invoke('add', { path: source })
  await git(['branch', 'fixture/base'], source)
  const head = (await git(['rev-parse', 'HEAD'], source)).stdout.trim()
  const result = await invoke('set-base-ref', { repo: repo.id, ref: 'fixture/base' })
  expect(result.repo.worktreeBaseRef).toBe('fixture/base')
  expect(store.getRepo(repo.id)?.worktreeBaseRef).toBe('fixture/base')
  await store.flushPendingOrThrowAsync()
  const persisted = JSON.parse(authority.readSerializedState() ?? '{}').repos.find(
    (value: { id: string }) => value.id === repo.id
  )
  expect(persisted.worktreeBaseRef).toBe('fixture/base')
  const refs = await invoke('search-refs', { repo: repo.id, query: 'fixture/base', limit: '5' })
  expect(JSON.stringify(refs)).toContain('fixture/base')
  expect((await git(['rev-parse', 'HEAD'], source)).stdout.trim()).toBe(head)
})
it('retains folder restrictions and rejects missing catalog selections and non-Git add paths', async () => {
  const folder = join(directory, 'folder')
  await mkdir(folder)
  await expect(invoke('add', { path: folder })).rejects.toThrow()
  expect(store.getRepos()).toHaveLength(0)
  store.addRepo({
    id: 'folder',
    path: folder,
    displayName: 'Folder',
    kind: 'folder',
    badgeColor: 'blue',
    addedAt: 1
  })
  expect((await invoke('show', { repo: 'folder' })).repo.kind).toBe('folder')
  await expect(invoke('set-base-ref', { repo: 'folder', ref: 'main' })).rejects.toThrow(
    'Folder mode does not support base refs.'
  )
  await expect(invoke('show', { repo: 'missing' })).rejects.toThrow()
})
it('keeps the existing old-peer failure explicit', async () => {
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'Old peer')
  )
  await expect(invoke('list')).rejects.toMatchObject({ code: 'method_not_found' })
})
