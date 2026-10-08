import type { Repo } from '../../src/shared/repo-types'
import type { Worktree } from '../../src/shared/worktree/types'
import type { TerminalTab } from '../../src/shared/terminal-tab-types'
import type { RetainedAgentEntry } from '../../src/renderer/src/store/slices/agent-status-contract'
import { runViewerFixtureProcess } from './helpers/viewer-fixture-process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect } from './helpers/orca-app'
import { ActivityViewerResultSchema } from '../../src/shared/activity-viewer-command'

test('Activity CLI applies the existing group, read, density and child preferences', async ({
  electronApp
}, testInfo) => {
  const orcaPage = await electronApp.firstWindow()
  await orcaPage.waitForFunction(
    () =>
      window.__store?.getState().persistedUIReady &&
      window.__store?.getState().workspaceSessionReady &&
      window.__store?.getState().terminalStartupRestorationReady &&
      window.__store?.getState().startupWorktreeRefreshCompleted
  )

  const userData = await electronApp.evaluate(({ app }) => app.getPath('userData'))
  const pid = await electronApp.evaluate(() => process.pid)
  writeFileSync(
    testInfo.outputPath('process-manifest.json'),
    JSON.stringify({ pid, userData, backgroundLaunch: process.env.ORCA_BACKGROUND_LAUNCH }, null, 2)
  )
  if (process.platform === 'darwin') {
    const { stdout: processState } = await runViewerFixtureProcess({
      program: 'ps',
      args: ['-p', String(pid), '-o', 'pid=,ppid=,ni=,comm=']
    })
    const { stdout: listeners } = await runViewerFixtureProcess({
      program: 'lsof',
      args: ['-nP', '-a', '-p', String(pid), '-iTCP', '-sTCP:LISTEN']
    })
    writeFileSync(testInfo.outputPath('process-isolation.txt'), `${processState}\n${listeners}`)
  }
  const results: unknown[] = []
  const call = async (args: string[], surface = 'activity-page') => {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('ORCA_'))
    )
    const { stdout } = await runViewerFixtureProcess({
      program: process.execPath,
      args: [
        path.join(process.cwd(), 'out/cli/index.js'),
        'ui',
        ...args,
        '--surface',
        surface,
        '--viewer',
        'host',
        '--json'
      ],
      env: { ...env, ORCA_USER_DATA_PATH: userData, ORCA_BACKGROUND_LAUNCH: '1' },
      timeoutMs: 20000
    }).catch((error: unknown) => {
      if (typeof error === 'object' && error !== null && 'stdout' in error) {
        writeFileSync(
          testInfo.outputPath('cli-error.json'),
          JSON.stringify({ stdout: error.stdout })
        )
      }
      throw error
    })
    const envelope = JSON.parse(stdout)
    results.push(envelope)
    writeFileSync(testInfo.outputPath('cli-results.json'), JSON.stringify(results, null, 2))
    expect(envelope._meta.runtimeId).toBeTruthy()
    return ActivityViewerResultSchema.parse(envelope.result)
  }
  expect(
    await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().every((window) => !window.isVisible() && !window.isFocused())
    )
  ).toBe(true)
  await orcaPage.evaluate(() => {
    window.__store?.setState({
      fetchAllWorktrees: async () => {},
      fetchRepos: async () => {},
      fetchReposForAllHosts: async () => {},
      startupWorktreeRefreshCompleted: false
    })
  })
  // Startup action replacement rehydrates once before the retained fixture is installed.
  await orcaPage.waitForFunction(() => window.__store?.getState().startupWorktreeRefreshCompleted)
  await orcaPage.evaluate(async () => {
    const state = window.__store?.getState()
    if (!state) {
      throw new Error('store unavailable')
    }
    await Promise.all([
      state.setAgentsGroupBy('none'),
      state.setAgentsReadFilter('all'),
      state.setAgentsCompactMode(false),
      state.setAgentsShowChildAgents(true)
    ])
  })
  await orcaPage.evaluate(
    ({ repoPaths, workspacePaths }) => {
      const store = window.__store
      if (!store) {
        throw new Error('store unavailable')
      }
      const now = Date.now() - 60_000
      const repos: Repo[] = ['a', 'b'].map((id, index) => ({
        id: `activity-repo-${id}`,
        path: repoPaths[index],
        displayName: `Activity project ${id}`,
        badgeColor: '',
        addedAt: 1
      }))
      const worktrees: Worktree[] = repos.map((repo, index) => ({
        id: `activity-wt-${index}`,
        repoId: repo.id,
        path: workspacePaths[index],
        head: 'fixture',
        branch: `activity-${index}`,
        isBare: false,
        isMainWorktree: false,
        displayName: `Activity workspace ${index}`,
        comment: '',
        linkedIssue: null,
        linkedPR: null,
        linkedLinearIssue: null,
        isArchived: false,
        isUnread: false,
        isPinned: false,
        sortOrder: index,
        lastActivityAt: now
      }))
      const retained: Record<string, RetainedAgentEntry> = {}
      const paneKeys: string[] = []
      const plan = [
        {
          id: 'a',
          leaf: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
          owner: 0,
          state: 'done',
          agentType: 'claude'
        },
        {
          id: 'b',
          leaf: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
          owner: 1,
          state: 'waiting',
          agentType: 'codex'
        },
        {
          id: 'c',
          leaf: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
          owner: 0,
          state: 'blocked',
          agentType: 'codex'
        }
      ] as const
      for (const [index, item] of plan.entries()) {
        const tab: TerminalTab = {
          id: `activity-tab-${item.id}`,
          ptyId: null,
          worktreeId: worktrees[item.owner].id,
          title: `Activity task ${item.id}`,
          customTitle: null,
          color: null,
          sortOrder: index,
          createdAt: now
        }
        const paneKey = `${tab.id}:${item.leaf}`
        paneKeys.push(paneKey)
        retained[paneKey] = {
          worktreeId: tab.worktreeId,
          tab,
          agentType: item.agentType,
          startedAt: now + index,
          entry: {
            paneKey,
            state: item.state,
            agentType: item.agentType,
            prompt: `Activity task ${item.id} ${'A long title for measuring the existing thread density. '.repeat(8)}`,
            lastAssistantMessage:
              'A long retained response for measuring the existing response line clamp. '.repeat(
                12
              ),
            terminalTitle: tab.title,
            updatedAt: now + index,
            stateStartedAt: now + index,
            stateHistory: [],
            ...(item.id === 'c'
              ? {
                  orchestration: {
                    parentPaneKey: paneKeys[0],
                    taskId: 'fixture-task',
                    dispatchId: 'fixture-dispatch'
                  }
                }
              : {})
          }
        }
      }
      store.setState({
        repos,
        worktreesByRepo: { [repos[0].id]: [worktrees[0]], [repos[1].id]: [worktrees[1]] },
        retainedAgentsByPaneKey: retained,
        agentStatusByPaneKey: {},
        runtimeAgentOrchestrationByPaneKey: {},
        acknowledgedAgentsByPaneKey: { [paneKeys[1]]: now + 10 },
        activityClearedAtByPaneKey: {},
        tabsByWorktree: {},
        unifiedTabsByWorktree: {},
        activeRepoId: repos[0].id,
        activeWorktreeId: null,
        agentsVisibleHostIds: ['local'],
        agentsFilterRepoIds: [],
        agentsHideWorkspacesFromOtherDevices: false,
        agentsHideAutomationGeneratedWorkspaces: false,
        agentsHideCliCreatedWorkspaces: false,
        agentsGroupBy: 'none',
        agentsReadFilter: 'all',
        agentsCompactMode: false,
        agentsShowChildAgents: true,
        activeView: 'activity'
      })
    },
    {
      repoPaths: ['a', 'b'].map((id) => path.join(userData, 'activity-fixture', id)),
      workspacePaths: ['a', 'b'].map((id) =>
        path.join(userData, 'activity-fixture', id, 'worktree')
      )
    }
  )
  const list = orcaPage.locator('[data-activity-viewer="activity-page"]')
  const rows = list.getByRole('listitem')
  await expect(rows)
    .toHaveCount(3)
    .catch(async (error: unknown) => {
      const diagnostic = await orcaPage.evaluate(() => {
        const state = window.__store?.getState()
        return state
          ? {
              retainedKeys: Object.keys(state.retainedAgentsByPaneKey),
              repos: state.repos.map((repo) => repo.id),
              worktrees: Object.values(state.worktreesByRepo)
                .flat()
                .map((worktree) => worktree.id),
              known: ['activity-wt-0', 'activity-wt-1'].map(
                (id) => state.getKnownWorktreeById(id)?.id
              ),
              visibleHosts: state.agentsVisibleHostIds,
              filterRepos: state.agentsFilterRepoIds,
              read: state.agentsReadFilter,
              children: state.agentsShowChildAgents,
              activeView: state.activeView,
              runtime: state.settings?.activeRuntimeEnvironmentId
            }
          : null
      })
      writeFileSync(
        testInfo.outputPath('fixture-diagnostic.json'),
        JSON.stringify(diagnostic, null, 2)
      )
      throw error
    })
  await list.screenshot({ path: testInfo.outputPath('before.png') })
  for (const by of ['none', 'status', 'project', 'worktree', 'agent']) {
    expect(await call(['activity', 'group', '--by', by])).toMatchObject({
      applied: true,
      persisted: true,
      writeOutcome: 'accepted',
      groupBy: by
    })
    await expect(rows).toHaveCount(3)
    await expect(list.locator('[data-activity-virtual-list]').getByRole('group')).toHaveCount(
      by === 'none' ? 0 : by === 'status' ? 3 : 2
    )
    await list.screenshot({ path: testInfo.outputPath(`group-${by}.png`) })
  }
  await call(['activity', 'group', '--by', 'none'])
  expect(await call(['activity', 'read', '--filter', 'unread'])).toMatchObject({
    applied: true,
    persisted: true
  })
  await expect(rows).toHaveCount(2)
  await expect(rows.filter({ hasText: 'Activity task b' })).toHaveCount(0)
  await call(['activity', 'read', '--filter', 'all'])
  expect(await call(['activity', 'children', '--enabled', 'false'])).toMatchObject({
    applied: true,
    persisted: true
  })
  await expect(rows).toHaveCount(2)
  await expect(rows.filter({ hasText: 'Activity task c' })).toHaveCount(0)
  await call(['activity', 'children', '--enabled', 'true'])
  await expect(rows).toHaveCount(3)
  await call(['activity', 'compact', '--enabled', 'false'])
  const row = rows.filter({ hasText: 'Activity task a' })
  const fullHeight = await row.evaluate((node) => node.getBoundingClientRect().height)
  expect(await call(['activity', 'compact', '--enabled', 'true'])).toMatchObject({
    applied: true,
    persisted: true,
    rendered: { densityMeasured: true }
  })
  await expect
    .poll(() => row.evaluate((node) => node.getBoundingClientRect().height))
    .toBeLessThan(fullHeight)
  await list.screenshot({ path: testInfo.outputPath('compact.png') })
  await orcaPage.evaluate(() => window.__store?.getState().setActiveView('terminal'))
  expect(await call(['activity', 'get'])).toMatchObject({
    applied: false,
    rendered: null,
    reason: 'activity_surface_unavailable'
  })
  await orcaPage.evaluate(() => {
    const state = window.__store?.getState()
    state?.setSidebarOpen(true)
    state?.setSidebarBody('agents')
  })
  const sidebar = orcaPage.locator('[data-activity-viewer="sidebar-agents"]')
  const sidebarRows = sidebar.getByRole('listitem')
  await expect(sidebarRows).toHaveCount(3)
  expect(await call(['activity', 'group', '--by', 'project'], 'sidebar-agents')).toMatchObject({
    applied: true,
    persisted: true
  })
  await expect(sidebar.locator('[data-activity-virtual-list]').getByRole('group')).toHaveCount(2)
  await call(['activity', 'group', '--by', 'none'], 'sidebar-agents')
  await call(['activity', 'read', '--filter', 'unread'], 'sidebar-agents')
  await expect(sidebarRows).toHaveCount(2)
  await expect(sidebarRows.filter({ hasText: 'Activity task b' })).toHaveCount(0)
  await call(['activity', 'read', '--filter', 'all'], 'sidebar-agents')
  await call(['activity', 'children', '--enabled', 'false'], 'sidebar-agents')
  await expect(sidebarRows).toHaveCount(2)
  await expect(sidebarRows.filter({ hasText: 'Activity task c' })).toHaveCount(0)
  await call(['activity', 'children', '--enabled', 'true'], 'sidebar-agents')
  await call(['activity', 'compact', '--enabled', 'false'], 'sidebar-agents')
  const sidebarRow = sidebarRows.filter({ hasText: 'Activity task a' })
  const sidebarFullHeight = await sidebarRow.evaluate((node) => node.getBoundingClientRect().height)
  expect(await call(['activity', 'compact', '--enabled', 'true'], 'sidebar-agents')).toMatchObject({
    applied: true,
    persisted: true
  })
  await expect
    .poll(() => sidebarRow.evaluate((node) => node.getBoundingClientRect().height))
    .toBeLessThan(sidebarFullHeight)
  await sidebar.screenshot({ path: testInfo.outputPath('sidebar-compact.png') })
  await orcaPage.evaluate(() => window.__store?.getState().setSidebarOpen(false))
  expect(await call(['activity', 'get'], 'sidebar-agents')).toMatchObject({
    applied: false,
    rendered: null,
    reason: 'activity_surface_unavailable'
  })
  expect(
    await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().every((window) => !window.isVisible() && !window.isFocused())
    )
  ).toBe(true)
})
