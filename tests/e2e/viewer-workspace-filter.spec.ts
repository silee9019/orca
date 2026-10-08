import { runViewerFixtureProcess } from './helpers/viewer-fixture-process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect } from './helpers/orca-app'
import { WorkspaceFilterResultSchema } from '../../src/shared/workspace-filter-command'
import type { WorkspaceFilters } from '../../src/shared/rpc-contract/workspace-filter-params'

test('workspace filter CLI changes the hidden sidebar and resets its saved filters', async ({
  orcaPage,
  electronApp
}, testInfo) => {
  const hidden = async () =>
    expect(
      await electronApp.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().every((window) => !window.isVisible() && !window.isFocused())
      )
    ).toBe(true)
  await hidden()
  const fixture = await orcaPage.evaluate(() => {
    const store = window.__store
    if (!store) {
      throw new Error('store_unavailable')
    }
    const state = store.getState()
    const repo = state.repos[0]
    if (!repo) {
      throw new Error('project_unavailable')
    }
    store.setState({ showSleepingWorkspaces: true, filterRepoIds: [] })
    return { repoId: repo.id, repoPath: repo.path }
  })
  const userData = await electronApp.evaluate(({ app }) => app.getPath('userData'))
  writeFileSync(
    testInfo.outputPath('process-manifest.json'),
    JSON.stringify(
      {
        pid: await electronApp.evaluate(() => process.pid),
        userData,
        backgroundLaunch: process.env.ORCA_BACKGROUND_LAUNCH
      },
      null,
      2
    )
  )
  if (process.platform === 'darwin') {
    const pid = String(await electronApp.evaluate(() => process.pid))
    const { stdout: processState } = await runViewerFixtureProcess({
      program: 'ps',
      args: ['-p', pid, '-o', 'pid=,ppid=,ni=,comm=']
    })
    const { stdout: listeners } = await runViewerFixtureProcess({
      program: 'lsof',
      args: ['-nP', '-a', '-p', pid, '-iTCP', '-sTCP:LISTEN']
    })
    writeFileSync(testInfo.outputPath('process-isolation.txt'), `${processState}\n${listeners}`)
  }
  const results: unknown[] = []
  const invoke = async (args: string[]) => {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('ORCA_'))
    )
    const { stdout } = await runViewerFixtureProcess({
      program: process.execPath,
      args: [path.join(process.cwd(), 'out/cli/index.js'), ...args, '--viewer', 'host', '--json'],
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
    expect(envelope._meta.runtimeId).toBeTruthy()
    expect(envelope.ok).toBe(true)
    return WorkspaceFilterResultSchema.parse(envelope.result)
  }
  const call = (operation: 'get' | 'set' | 'reset', filters?: Partial<WorkspaceFilters>) =>
    invoke([
      'ui',
      'workspace-filter',
      operation,
      ...(filters ? ['--filters', JSON.stringify(filters)] : [])
    ])
  const before = await call('get')
  expect(before).toMatchObject({ persisted: true, applied: true })
  await orcaPage
    .locator('[data-sidebar-resize-handle]')
    .locator('..')
    .screenshot({ path: testInfo.outputPath('before.png') })
  const selected = await call('set', {
    hideDefaultBranchWorkspace: true,
    filterRepoIds: [fixture.repoId]
  })
  expect(selected).toMatchObject({
    persisted: true,
    applied: true,
    filters: { hideDefaultBranchWorkspace: true, filterRepoIds: [fixture.repoId] }
  })
  expect(selected.visibleWorktreeIds?.length).toBeLessThan(before.visibleWorktreeIds?.length ?? 0)
  expect(
    await orcaPage.evaluate(() => window.api.ui.get().then((ui) => ui.hideDefaultBranchWorkspace))
  ).toBe(true)
  await orcaPage
    .locator('[data-sidebar-resize-handle]')
    .locator('..')
    .screenshot({ path: testInfo.outputPath('filtered.png') })
  expect(
    (await invoke(['ui', 'project-filter', 'remove', '--repo', fixture.repoId])).filters
  ).toMatchObject({ filterRepoIds: [], hideDefaultBranchWorkspace: true })
  expect(
    (await invoke(['ui', 'project-filter', 'toggle', '--repo', fixture.repoId])).filters
  ).toEqual(selected.filters)
  expect((await call('get')).filters).toEqual(selected.filters)
  const reset = await call('reset')
  expect(reset).toMatchObject({
    persisted: true,
    applied: true,
    filters: { hideDefaultBranchWorkspace: false, filterRepoIds: [] }
  })
  expect(reset.visibleWorktreeIds).toEqual(before.visibleWorktreeIds)
  await orcaPage
    .locator('[data-sidebar-resize-handle]')
    .locator('..')
    .screenshot({ path: testInfo.outputPath('reset.png') })
  const secondRepoRoot = mkdtempSync(path.join(os.tmpdir(), 'orca-viewer-filter-second-'))
  try {
    const secondRepo = path.join(secondRepoRoot, 'other-project')
    await runViewerFixtureProcess({
      program: 'git',
      args: ['clone', '--no-hardlinks', fixture.repoPath, secondRepo]
    })
    await orcaPage.evaluate(async (repoPath) => {
      const store = window.__store
      if (!store) {
        throw new Error('store_unavailable')
      }
      await window.api.repos.add({ path: repoPath })
      await store.getState().fetchRepos()
      await store.getState().fetchAllWorktrees()
      window.dispatchEvent(new CustomEvent('orca:toggle-workspace-board'))
    }, secondRepo)
    await expect(orcaPage.locator('[data-workspace-board-sheet]')).toBeVisible()
    const menu = (state: 'open' | 'closed') =>
      invoke(['ui', 'workspace-filter', 'menu', '--surface', 'workspace-board', '--state', state])
    expect((await menu('open')).control?.open).toBe(true)
    const control = (action: string, args: string[] = []) =>
      invoke(['ui', 'project-filter', action, '--surface', 'workspace-board', ...args])
    const searched = await control('search', ['--query', 'other-project'])
    expect(searched.control?.resultRepoIds).toHaveLength(1)
    expect(searched.filters).toEqual(reset.filters)
    const repoId = searched.control?.resultRepoIds[0]
    if (!repoId) {
      throw new Error('search_result_missing')
    }
    expect((await control('highlight', ['--repo', repoId])).control?.highlightedRepoId).toBe(repoId)
    expect((await control('focus')).control?.inputFocused).toBe(true)
    expect(
      (await control('search', ['--query', 'no-project-matches-this'])).control?.resultRepoIds
    ).toEqual([])
    await orcaPage
      .locator('[data-slot=dropdown-menu-content]')
      .screenshot({ path: testInfo.outputPath('search-empty.png') })
    expect((await menu('closed')).control).toMatchObject({ open: false, query: '' })
    expect((await menu('open')).control?.query).toBe('')
    await menu('closed')
    await orcaPage.evaluate(() =>
      window.dispatchEvent(new CustomEvent('orca:toggle-workspace-board'))
    )
    await orcaPage
      .getByRole('button', { name: /Workspace options|워크스페이스 옵션/ })
      .first()
      .click()
    await orcaPage
      .getByRole('menuitem', { name: /Projects|프로젝트/ })
      .first()
      .hover()
    await expect(
      orcaPage.getByRole('menu', { name: /Projects|프로젝트/ }).getByRole('combobox')
    ).toBeVisible()
    const panel = (action: string, args: string[] = []) =>
      invoke(['ui', 'project-filter', action, '--surface', 'project-panel', ...args])
    const panelSearch = await panel('search', ['--query', 'other-project'])
    expect(panelSearch.control?.resultRepoIds).toEqual([repoId])
    await panel('highlight', ['--repo', repoId])
    expect((await panel('select', ['--repo', repoId])).control).toMatchObject({
      query: '',
      inputFocused: true
    })
    expect((await call('get')).filters.filterRepoIds).toEqual([repoId])
    expect((await panel('remove-last')).filters.filterRepoIds).toEqual([])
    await orcaPage
      .getByRole('menu', { name: /Projects|프로젝트/ })
      .screenshot({ path: testInfo.outputPath('project-panel-removed.png') })
  } finally {
    rmSync(secondRepoRoot, { recursive: true, force: true })
  }
  writeFileSync(testInfo.outputPath('cli-results.json'), JSON.stringify(results, null, 2))
  await hidden()
})
