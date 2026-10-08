import { runViewerFixtureProcess } from './helpers/viewer-fixture-process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect } from './helpers/orca-app'
import { WorkspaceListViewerResultSchema } from '../../src/shared/workspace-list-viewer-command'

test('workspace list CLI acknowledges grouping and existing persisted sort', async ({
  orcaPage,
  electronApp
}, testInfo) => {
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
  const call = async (args: string[]) => {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('ORCA_'))
    )
    const { stdout } = await runViewerFixtureProcess({
      program: process.execPath,
      args: [
        path.join(process.cwd(), 'out/cli/index.js'),
        'ui',
        ...args,
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
    return WorkspaceListViewerResultSchema.parse(envelope.result)
  }
  expect(
    await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().every((window) => !window.isVisible() && !window.isFocused())
    )
  ).toBe(true)
  const initial = await call(['workspace-list', 'get'])
  expect(initial.rendered?.rows.length).toBeGreaterThan(0)
  const list = orcaPage.locator('[data-worktree-sidebar-container]')
  await list.screenshot({ path: testInfo.outputPath('before.png') })
  const group = await call(['workspace-list', 'group', '--by', 'repo'])
  expect(group).toMatchObject({
    applied: true,
    persisted: true,
    writeOutcome: 'accepted',
    collapsedGroups: []
  })
  const collapse = list.locator('[data-repo-header-collapse-affordance]').first()
  await expect(collapse).toBeVisible()
  await collapse.click()
  await expect(list.locator('[data-repo-header-id][aria-expanded]').first()).toHaveAttribute(
    'aria-expanded',
    'false'
  )
  expect(await call(['workspace-list', 'group', '--by', 'repo'])).toMatchObject({
    applied: true,
    persisted: true,
    collapsedGroups: []
  })
  await expect(list.locator('[data-repo-header-id][aria-expanded]').first()).toHaveAttribute(
    'aria-expanded',
    'true'
  )
  const published = (await call(['workspace-list', 'get'])).rendered
  const groupKey = published?.rows.find(
    (row) => row.type === 'header' && published.collapsibleKeys?.includes(row.key)
  )?.key
  expect(groupKey).toBeTruthy()
  const groupHeader = list.locator(
    `[id="worktree-list-option-${encodeURIComponent(groupKey ?? '')}"]`
  )
  await expect(groupHeader).toHaveAttribute('aria-expanded', 'true')
  const toggleGroup = () => call(['workspace-list', 'group-toggle', '--group-key', groupKey ?? ''])
  expect(await toggleGroup()).toMatchObject({
    dispatched: true,
    applied: true,
    persisted: true,
    collapsedGroups: [groupKey]
  })
  await expect(groupHeader).toHaveAttribute('aria-expanded', 'false')
  expect(await toggleGroup()).toMatchObject({ applied: true, persisted: true, collapsedGroups: [] })
  await expect(groupHeader).toHaveAttribute('aria-expanded', 'true')
  await expect(
    call(['workspace-list', 'group-toggle', '--group-key', 'not-a-published-key'])
  ).rejects.toMatchObject({ stdout: expect.stringContaining('workspace_list_group_unavailable') })
  for (const by of ['none', 'workspace-status', 'pr-status', 'repo']) {
    const result = await call(['workspace-list', 'group', '--by', by])
    expect(result).toMatchObject({
      applied: true,
      persisted: true,
      groupBy: by,
      rendered: { groupBy: by }
    })
    expect(result.rendered?.rows.length).toBeGreaterThan(0)
    await list.screenshot({ path: testInfo.outputPath(`group-${by}.png`) })
  }
  // Headers without a chevron still collapse on click, so the CLI must reach them too.
  let chevronlessToggles = 0
  for (const by of ['none', 'pr-status']) {
    const view = (await call(['workspace-list', 'group', '--by', by])).rendered
    const headerKey = view?.rows.find((row) => row.type === 'header')?.key
    if (!headerKey) {
      continue
    }
    expect(view?.collapsibleKeys).toContain(headerKey)
    const cards = list.locator('[data-worktree-card-viewer-id]')
    const expanded = await cards.count()
    const toggle = () => call(['workspace-list', 'group-toggle', '--group-key', headerKey])
    expect(await toggle()).toMatchObject({ applied: true, persisted: true })
    await expect.poll(() => cards.count()).toBeLessThan(expanded)
    expect(await toggle()).toMatchObject({ applied: true, persisted: true, collapsedGroups: [] })
    await expect.poll(() => cards.count()).toBe(expanded)
    chevronlessToggles += 1
  }
  expect(chevronlessToggles).toBeGreaterThan(0)
  await call(['workspace-list', 'group', '--by', 'repo'])
  for (const by of ['name', 'manual', 'smart', 'recent', 'repo']) {
    const result = await call(['workspace-list', 'sort', '--by', by])
    expect(result).toMatchObject({
      applied: true,
      persisted: true,
      sortBy: by,
      metadataPersisted: null
    })
    const domIds = await list
      .locator('[data-worktree-card-viewer-id]')
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('data-worktree-card-viewer-id'))
      )
    const logicalIds =
      result.rendered?.rows.filter((row) => row.type === 'item').map((row) => row.workspaceId) ?? []
    let previous = -1
    for (const id of domIds) {
      const index = logicalIds.indexOf(id)
      expect(index).toBeGreaterThan(previous)
      previous = index
    }
    expect(domIds.length).toBeGreaterThan(0)
  }
  for (const by of ['recent', 'manual']) {
    expect(await call(['workspace-list', 'project-order', '--by', by])).toMatchObject({
      applied: true,
      persisted: true,
      projectOrderBy: by
    })
  }
  await list.screenshot({ path: testInfo.outputPath('after.png') })
  await call(['workspace-list', 'group', '--by', 'none'])
  await expect(call(['workspace-list', 'project-order', '--by', 'recent'])).rejects.toThrow()
  await orcaPage.evaluate(() => window.__store?.getState().setSidebarOpen(false))
  expect(await call(['workspace-list', 'group', '--by', 'repo'])).toMatchObject({
    applied: false,
    persisted: true,
    rendered: null,
    reason: 'workspace_list_unavailable'
  })
  await orcaPage.evaluate(() => window.__store?.getState().setSidebarOpen(true))
  expect(
    await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().every((window) => !window.isVisible() && !window.isFocused())
    )
  ).toBe(true)
})
