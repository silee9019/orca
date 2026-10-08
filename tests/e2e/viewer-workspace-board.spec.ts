import { runViewerFixtureProcess } from './helpers/viewer-fixture-process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect } from './helpers/orca-app'
import { WorkspaceBoardResultSchema } from '../../src/shared/workspace-board-command'

test('workspace board CLI manages status columns through the board controls', async ({
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
        'workspace-board',
        ...args,
        '--viewer',
        'host',
        '--json'
      ],
      env: { ...env, ORCA_USER_DATA_PATH: userData, ORCA_BACKGROUND_LAUNCH: '1' },
      timeoutMs: 20000
    })
    const envelope = JSON.parse(stdout)
    results.push(envelope)
    writeFileSync(testInfo.outputPath('cli-results.json'), JSON.stringify(results, null, 2))
    expect(envelope._meta.runtimeId).toBeTruthy()
    return WorkspaceBoardResultSchema.parse(envelope.result)
  }
  const refused = (args: string[], reason: string) =>
    expect(call(args)).rejects.toMatchObject({ stdout: expect.stringContaining(reason) })
  const windowsHidden = () =>
    electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().every((window) => !window.isVisible() && !window.isFocused())
    )
  const storeStatuses = () => orcaPage.evaluate(() => window.__store?.getState().workspaceStatuses)
  const hostStatuses = () =>
    orcaPage.evaluate(async () => (await window.api.ui.get()).workspaceStatuses)
  // Why: lanes are virtualized, so compare the leading lanes only; sidebar rows reuse the attribute outside the board.
  const board = orcaPage.locator('[data-workspace-board-selection-surface]')
  const lane = (id: string) => board.locator(`[data-workspace-status="${id}"]`)
  const leadingLaneIds = async () =>
    (
      await board
        .locator('[data-workspace-status]')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-workspace-status')))
    ).slice(0, 2)
  expect(await windowsHidden()).toBe(true)

  // A closed board is reported as unavailable and nothing is changed.
  expect(await call(['get'])).toMatchObject({
    applied: false,
    rendered: null,
    reason: 'workspace_board_unavailable'
  })
  await refused(['status-add'], 'workspace_board_unavailable')

  // The board opens through its own toolbar trigger.
  await orcaPage.locator('[data-workspace-board-trigger]').click()
  await expect(orcaPage.locator('[data-workspace-board-selection-surface]')).toBeVisible()
  const initial = await call(['get'])
  expect(initial).toMatchObject({ applied: true, rendered: { open: true } })
  const initialIds = initial.statuses.map((status) => status.id)
  expect(initialIds).toEqual(['todo', 'in-progress', 'in-review', 'completed'])
  await orcaPage.screenshot({ path: testInfo.outputPath('board-initial.png') })

  // The settings menu's own move button and the CLI reach the same state.
  await orcaPage.locator('[data-contextual-tour-target="workspace-board-settings"]').click()
  // Why: the app renders localized labels, so pick the menu row and its buttons by structure.
  const todoRow = orcaPage
    .locator('[data-slot="dropdown-menu-content"] input')
    .first()
    .locator('xpath=ancestor::div[contains(@class, "rounded-md")][1]')
  await todoRow.getByRole('button').nth(2).click()
  await expect.poll(leadingLaneIds).toEqual(['in-progress', 'todo'])
  expect((await call(['get'])).statuses.map((status) => status.id)).toEqual([
    'in-progress',
    'todo',
    'in-review',
    'completed'
  ])
  await orcaPage.keyboard.press('Escape')
  const movedBack = await call(['status-move', '--status', 'todo', '--direction', 'left'])
  expect(movedBack).toMatchObject({ dispatched: true, applied: true, persisted: true })
  expect(movedBack.statuses.map((status) => status.id)).toEqual(initialIds)
  await expect.poll(leadingLaneIds).toEqual(['todo', 'in-progress'])

  // Each column edit is applied to the rendered board, the store and the host preference.
  // An open settings menu must show a CLI rename and never write its old field text back.
  await orcaPage.locator('[data-contextual-tour-target="workspace-board-settings"]').click()
  const menuNames = orcaPage.locator('[data-slot="dropdown-menu-content"] input')
  await menuNames.first().focus()
  const renamed = await call(['status-rename', '--status', 'todo', '--label', '  Backlog  '])
  await expect(menuNames.first()).toHaveValue('Backlog')
  await orcaPage.keyboard.press('Escape')
  await expect(orcaPage.locator('[data-slot="dropdown-menu-content"]')).toHaveCount(0)
  expect((await storeStatuses())?.[0]).toMatchObject({ id: 'todo', label: 'Backlog' })
  expect(renamed).toMatchObject({ applied: true, persisted: true, writeOutcome: 'unknown' })
  expect(renamed.statuses[0]).toMatchObject({ id: 'todo', label: 'Backlog' })
  await expect(lane('todo')).toContainText('Backlog')
  expect(await call(['status-color', '--status', 'todo', '--color', 'rose'])).toMatchObject({
    applied: true,
    persisted: true
  })
  await expect(lane('todo')).toHaveClass(/border-t-rose-500/)
  expect(await call(['status-icon', '--status', 'todo', '--icon', 'flag'])).toMatchObject({
    applied: true,
    persisted: true
  })
  await expect(lane('todo').locator('svg.lucide-flag').first()).toBeVisible()
  expect((await storeStatuses())?.[0]).toMatchObject({
    label: 'Backlog',
    color: 'rose',
    icon: 'flag'
  })
  expect((await hostStatuses())?.[0]).toMatchObject({
    label: 'Backlog',
    color: 'rose',
    icon: 'flag'
  })

  // Add then remove: the board names the column and the CLI reports its id.
  const added = await call(['status-add'])
  expect(added).toMatchObject({ applied: true, persisted: true, reassignment: 'not_requested' })
  const newStatus = added.statuses.at(-1)
  expect(newStatus).toMatchObject({ label: 'Status 5' })
  expect(await storeStatuses()).toEqual(added.statuses)
  expect(await hostStatuses()).toEqual(added.statuses)
  const removed = await call(['status-remove', '--status', newStatus?.id ?? ''])
  expect(removed).toMatchObject({ applied: true, persisted: true, reassignment: 'unknown' })
  expect(removed.statuses.map((status) => status.id)).toEqual(initialIds)

  // Actions the board would ignore are refused before anything changes.
  await refused(
    ['status-move', '--status', 'todo', '--direction', 'left'],
    'workspace_status_action_unavailable'
  )
  await refused(
    ['status-move', '--status', 'completed', '--direction', 'right'],
    'workspace_status_action_unavailable'
  )
  await refused(
    ['status-rename', '--status', 'ghost', '--label', 'x'],
    'workspace_status_unavailable'
  )
  expect((await call(['get'])).statuses).toEqual(removed.statuses)

  // Column width reaches the rendered lanes and the host preference.
  const widened = await call(['column-width', '--width', '400'])
  expect(widened).toMatchObject({ applied: true, persisted: true, columnWidth: 400 })
  await expect(orcaPage.locator('[data-workspace-board-lane-grid] > [data-index="0"]')).toHaveCSS(
    'width',
    '400px'
  )
  expect(
    await orcaPage.evaluate(async () => (await window.api.ui.get()).workspaceBoardColumnWidth)
  ).toBe(400)
  await refused(['column-width', '--width', '521'], 'invalid_argument')
  await orcaPage.screenshot({ path: testInfo.outputPath('board-after.png') })

  // Assignment goes through the board's own "Move to status" handler; this test never enables the Linear sync.
  await orcaPage.evaluate(() =>
    window.__store?.getState().setSyncTaskStatusFromWorkspaceBoard(false)
  )
  const folderPath = testInfo.outputPath('folder-project')
  mkdirSync(folderPath, { recursive: true })
  const folderRepoId = await orcaPage.evaluate(async (projectPath) => {
    const added = await window.api.repos.add({ path: projectPath, kind: 'folder' })
    if ('error' in added) {
      throw new Error(added.error)
    }
    await window.__store?.getState().fetchRepos()
    await window.__store?.getState().fetchWorktrees(added.repo.id)
    return added.repo.id
  }, folderPath)
  await expect
    .poll(async () =>
      (await call(['get'])).rendered?.workspaces?.some((item) => item.repoId === folderRepoId)
    )
    .toBe(true)
  const published = (await call(['get'])).rendered
  expect(published?.taskStatusSyncEnabled).toBe(false)
  const localWorkspaces = (published?.workspaces ?? []).filter((item) => item.hostId === 'local')
  const gitWorkspace = localWorkspaces.find((item) => item.repoId !== folderRepoId)
  const folderWorkspace = localWorkspaces.find((item) => item.repoId === folderRepoId)
  expect(gitWorkspace).toBeTruthy()
  expect(folderWorkspace).toBeTruthy()
  const card = (id: string) => board.locator(`[data-workspace-board-card-id$="|${id}"]`)
  const hostStatus = (repoId: string, id: string) =>
    orcaPage.evaluate(
      async (args) =>
        (await window.api.worktrees.list({ repoId: args.repoId })).find(
          (item) => item.id === args.id
        )?.workspaceStatus,
      { repoId, id }
    )
  for (const workspace of [gitWorkspace, folderWorkspace]) {
    if (!workspace) {
      continue
    }
    const from = workspace.statusId
    const to = from === 'in-progress' ? 'todo' : 'in-progress'
    const moved = await call(['assign', '--workspace', workspace.id, '--status', to])
    expect(moved).toMatchObject({
      dispatched: true,
      applied: true,
      persisted: true,
      writeOutcome: 'unknown',
      assignment: {
        statusId: to,
        taskStatusSync: 'not_requested',
        writeFailureReporting: 'swallowed_by_store',
        workspaces: [
          { workspaceId: workspace.id, hostId: 'local', changed: true, hostWrite: 'confirmed' }
        ]
      }
    })
    await expect(
      lane(to).locator(`[data-workspace-board-card-id$="|${workspace.id}"]`)
    ).toHaveCount(1)
    await expect(card(workspace.id)).toHaveCount(1)
    // The test reads the host catalog through the list IPC; the bridge reads it through the host-qualified local listing.
    expect(await hostStatus(workspace.repoId, workspace.id)).toBe(to)
    // Moving it to the status it already has changes and writes nothing.
    const unchanged = await call(['assign', '--workspace', workspace.id, '--status', to])
    expect(unchanged).toMatchObject({
      dispatched: false,
      applied: true,
      persisted: null,
      assignment: { workspaces: [{ changed: false, hostWrite: 'not_requested' }] }
    })
    expect(unchanged).not.toHaveProperty('reason')
  }
  await orcaPage.screenshot({ path: testInfo.outputPath('board-assigned.png') })
  await refused(
    ['assign', '--workspace', 'folder:0c1d', '--status', 'todo'],
    'workspace_folder_unsupported'
  )
  await refused(
    ['assign', '--workspace', 'no-such::/workspace', '--status', 'todo'],
    'workspace_unavailable'
  )
  await refused(
    ['assign', '--workspace', gitWorkspace?.id ?? '', '--status', 'ghost'],
    'workspace_status_unavailable'
  )

  // The card's own context menu reaches the same move and the same final state.
  if (gitWorkspace) {
    const cardNode = card(gitWorkspace.id)
    const fromCli = (await call(['get'])).rendered?.workspaces?.find(
      (item) => item.id === gitWorkspace.id
    )?.statusId
    const menuTarget = fromCli === 'in-review' ? 'completed' : 'in-review'
    await cardNode.click({ button: 'right' })
    await orcaPage.locator('[data-slot="dropdown-menu-sub-trigger"]').first().click()
    // Why: the app renders localized labels, so pick the radio item by the status order the board shows.
    await orcaPage
      .locator('[data-slot="dropdown-menu-radio-item"]')
      .nth(initialIds.indexOf(menuTarget))
      .click()
    await expect
      .poll(async () =>
        (await call(['get'])).rendered?.workspaces?.find((item) => item.id === gitWorkspace.id)
      )
      .toMatchObject({ statusId: menuTarget })
    expect(await hostStatus(gitWorkspace.repoId, gitWorkspace.id)).toBe(menuTarget)
  }

  // Closing the board makes it unavailable again.
  await orcaPage.locator('[data-workspace-board-trigger]').click()
  await expect(orcaPage.locator('[data-workspace-board-selection-surface]')).toHaveCount(0)
  await refused(['status-add'], 'workspace_board_unavailable')
  expect(await windowsHidden()).toBe(true)
})
