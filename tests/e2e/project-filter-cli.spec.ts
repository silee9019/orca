import { callProjectFilterCli } from './helpers/project-filter-cli'
import { writeFileSync } from 'node:fs'
import { test, expect } from './helpers/orca-app'
import { SshGitProvider } from '../../src/main/providers/ssh-git-provider'
import { SshChannelMultiplexer } from '../../src/main/ssh/ssh-channel-multiplexer'
import { ProjectFilterResultSchema } from '../../src/shared/project-filter'

test('project filter CLI acknowledges storage and the hidden rendered sidebar', async ({
  orcaPage,
  electronApp
}, testInfo) => {
  expect(
    await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().every((window) => !window.isVisible() && !window.isFocused())
    )
  ).toBe(true)
  let receiveClient = (_data: Buffer): void => {}
  let receiveRelay = (_data: Buffer): void => {}
  const clientMux = new SshChannelMultiplexer({
    write: (data) => {
      queueMicrotask(() => receiveRelay(data))
    },
    onData: (listener) => {
      receiveClient = listener
    },
    onClose: () => {}
  })
  const relayMux = new SshChannelMultiplexer({
    write: (data) => {
      queueMicrotask(() => receiveClient(data))
    },
    onData: (listener) => {
      receiveRelay = listener
    },
    onClose: () => {}
  })
  const relayRequests: unknown[] = []
  relayMux.onRequest('git.listWorktrees', (params) => {
    relayRequests.push(params)
    return [
      {
        path: '/fixture/remote',
        head: 'a'.repeat(40),
        branch: 'filter-other',
        isBare: false,
        isMainWorktree: true
      }
    ]
  })
  let remoteRows
  try {
    remoteRows = await new SshGitProvider('filter-fixture-ssh', clientMux).listWorktrees(
      '/fixture/remote'
    )
  } finally {
    clientMux.dispose()
    relayMux.dispose()
  }
  expect(relayRequests).toEqual([{ repoPath: '/fixture/remote' }])
  const remoteRow = remoteRows[0]
  expect(remoteRow.branch).toBe('filter-other')
  writeFileSync(
    testInfo.outputPath('ssh-relay.json'),
    JSON.stringify({ relayRequests, remoteRows }, null, 2)
  )
  const fixtures = await orcaPage.evaluate((remoteRow) => {
    const store = window.__store
    if (!store) {
      throw new Error('store_unavailable')
    }
    const state = store.getState()
    const repo = state.repos[0]
    const worktree = state.worktreesByRepo[repo.id]?.[0]
    if (!worktree) {
      throw new Error('workspace_unavailable')
    }
    const otherRepo = {
      ...repo,
      id: 'project-filter-other',
      displayName: 'Filter other project',
      path: remoteRow.path,
      connectionId: 'filter-fixture-ssh',
      executionHostId: 'ssh:filter-fixture-ssh' as const
    }
    const otherWorktree = {
      ...worktree,
      id: 'project-filter-other-worktree',
      repoId: otherRepo.id,
      path: remoteRow.path,
      branch: remoteRow.branch,
      hostId: 'ssh:filter-fixture-ssh' as const
    }
    store.setState({
      repos: [...state.repos, otherRepo],
      worktreesByRepo: { ...state.worktreesByRepo, [otherRepo.id]: [otherWorktree] },
      projectGroups: [
        ...state.projectGroups,
        {
          id: 'filter-folder-group',
          name: 'Filter folder group',
          parentPath: repo.path,
          parentGroupId: null,
          createdFrom: 'manual',
          tabOrder: 100,
          isCollapsed: false,
          color: null,
          createdAt: 1,
          updatedAt: 1
        }
      ],
      folderWorkspaces: [
        ...state.folderWorkspaces,
        {
          id: 'filter-folder',
          projectGroupId: 'filter-folder-group',
          name: 'Filter folder workspace',
          folderPath: repo.path,
          linkedTask: null,
          comment: '',
          isArchived: false,
          isUnread: false,
          isPinned: false,
          sortOrder: 1,
          lastActivityAt: 1,
          createdAt: 1,
          updatedAt: 1
        }
      ],
      workspaceHostScope: 'all',
      visibleWorkspaceHostIds: null,
      showSleepingWorkspaces: true,
      filterRepoIds: []
    })
    return { repoId: repo.id, otherRepoId: otherRepo.id, otherWorktreeId: otherWorktree.id }
  }, remoteRow)
  const userData = await electronApp.evaluate(({ app }) => app.getPath('userData'))
  const envelopes: unknown[] = []
  const call = async (operation: 'get' | 'set' | 'clear', repoIds?: string[]) => {
    const response = await callProjectFilterCli(userData, operation, repoIds)
    envelopes.push(response)
    expect(response._meta.runtimeId).toBeTruthy()
    if (!response.ok) {
      throw new Error(JSON.stringify(response.error))
    }
    return ProjectFilterResultSchema.parse(response.result)
  }
  const before = await call('get')
  expect(before.persisted).toBe(true)
  expect(before.applied).toBe(true)
  expect(before.visibleWorktreeIds).toContain(fixtures.otherWorktreeId)
  expect(before.visibleFolderWorkspaceIds).toContain('filter-folder')
  await expect(orcaPage.getByRole('option').filter({ hasText: 'filter-other' })).toHaveCount(1)
  await expect(orcaPage.getByText('Filter folder workspace', { exact: true })).toHaveCount(1)
  await orcaPage.screenshot({ path: testInfo.outputPath('before.png') })
  const selected = await call('set', [fixtures.repoId])
  expect(selected).toMatchObject({ repoIds: [fixtures.repoId], persisted: true, applied: true })
  expect(selected.visibleWorktreeIds).not.toContain(fixtures.otherWorktreeId)
  expect(selected.visibleFolderWorkspaceIds).toContain('filter-folder')
  await expect(orcaPage.getByRole('option').filter({ hasText: 'filter-other' })).toHaveCount(0)
  await orcaPage.screenshot({ path: testInfo.outputPath('selected.png') })
  expect(await orcaPage.evaluate(() => window.api.ui.get().then((ui) => ui.filterRepoIds))).toEqual(
    [fixtures.repoId]
  )
  expect((await call('get')).repoIds).toEqual([fixtures.repoId])
  const cleared = await call('clear')
  expect(cleared).toMatchObject({ repoIds: [], persisted: true, applied: true })
  expect(cleared.visibleWorktreeIds).toContain(fixtures.otherWorktreeId)
  expect(cleared.visibleFolderWorkspaceIds).toContain('filter-folder')
  await expect(orcaPage.getByRole('option').filter({ hasText: 'filter-other' })).toHaveCount(1)
  const allRepoIds = await orcaPage.evaluate(() =>
    window.__store!.getState().repos.map((repo) => repo.id)
  )
  for (let repeat = 0; repeat < 2; repeat++) {
    const allSelected = await call('set', allRepoIds)
    expect(allSelected).toMatchObject({ repoIds: allRepoIds, persisted: true, applied: true })
    expect(allSelected.visibleWorktreeIds).toContain(fixtures.otherWorktreeId)
    expect(allSelected.visibleFolderWorkspaceIds).toContain('filter-folder')
  }
  expect(await call('clear')).toMatchObject({ repoIds: [], persisted: true, applied: true })
  const resultsPath = testInfo.outputPath('cli-results.json')
  writeFileSync(resultsPath, JSON.stringify(envelopes, null, 2))
  await testInfo.attach('cli-results', { path: resultsPath, contentType: 'application/json' })
  expect(await orcaPage.evaluate(() => window.__store?.getState().showSleepingWorkspaces)).toBe(
    true
  )
  await orcaPage.screenshot({ path: testInfo.outputPath('cleared.png') })
  expect(
    await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().every((window) => !window.isVisible() && !window.isFocused())
    )
  ).toBe(true)
})
