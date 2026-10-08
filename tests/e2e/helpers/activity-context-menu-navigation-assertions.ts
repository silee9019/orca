import { writeFileSync } from 'node:fs'
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test'
import { parsePaneKey } from '../../../src/shared/stable-pane-id'
import type { ActivityViewerResult } from '../../../src/shared/activity-viewer-command'

export async function assertActivityContextMenuNavigation(
  page: Page,
  call: (args: string[], surface?: string) => Promise<ActivityViewerResult>,
  testInfo: TestInfo
): Promise<void> {
  const retainedKey = 'activity-tab-a:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  const residentTitle = 'CLI select exact resident target'
  const showSource = async (surface: string) => {
    await page.evaluate(() => window.__store?.getState().setActiveView('terminal'))
    await page.evaluate((surface) => {
      const state = window.__store?.getState()
      state?.setActiveView(surface === 'activity-page' ? 'activity' : 'terminal')
      state?.setSidebarOpen(surface === 'sidebar-agents')
      state?.setSidebarBody('agents')
    }, surface)
    for (const args of [
      ['scope-reset'],
      ['search', '--query', ''],
      ['read', '--filter', 'all'],
      ['group', '--by', 'none']
    ]) {
      await call(['activity', ...args], surface)
    }
    await page.mouse.click(1, 1)
    if (surface === 'activity-page') {
      expect((await call(['activity', 'get'], surface)).rendered?.selectedPaneKey).toBeNull()
    }
  }
  const workspace = page.locator(
    '[data-rendered-active-worktree-id="activity-wt-0"][data-rendered-active-execution-host-id="local"]'
  )
  const readStart = async () => {
    const start = {
      workspaceId: await page.evaluate(() => window.__store?.getState().activeWorktreeId),
      hostId: await workspace.getAttribute('data-rendered-active-execution-host-id')
    }
    expect(start).toEqual({ workspaceId: 'activity-wt-0', hostId: 'local' })
    return start
  }
  const activateOriginal = async (item: Locator) => {
    const activation = await item.evaluate((node) => {
      const store = window.__store
      if (!store || !(node instanceof HTMLElement)) {
        throw new Error('activity_menu_activation_fixture_missing')
      }
      const activate = store.getState().setActiveWorktree
      const calls: Parameters<typeof activate>[] = []
      // Observe the original synchronous activation without changing its arguments or result.
      store.setState({
        setActiveWorktree: (...args: Parameters<typeof activate>) => {
          calls.push(args)
          return activate(...args)
        }
      })
      try {
        node.click()
      } finally {
        store.setState({ setActiveWorktree: activate })
      }
      return { calls, restored: store.getState().setActiveWorktree === activate }
    })
    expect(activation).toEqual({ calls: [['activity-wt-0', 'local']], restored: true })
    return activation
  }
  const arriveWorkspace = async () => {
    await expect(workspace).toBeVisible()
    await expect(
      workspace.locator('xpath=ancestor::*[@data-terminal-workbench-container]')
    ).toHaveAttribute('aria-hidden', 'false')
    return {
      workspaceId: await workspace.getAttribute('data-rendered-active-worktree-id'),
      hostId: await workspace.getAttribute('data-rendered-active-execution-host-id')
    }
  }
  await showSource('activity-page')
  const resident = page
    .locator('[data-activity-viewer="activity-page"] [data-activity-context-trigger]')
    .filter({ hasText: residentTitle })
  const residentKey = await resident.getAttribute('data-activity-context-pane')
  const parsed = residentKey ? parsePaneKey(residentKey) : null
  if (!parsed || !residentKey) {
    throw new Error('activity_menu_resident_missing')
  }
  const { tabId, leafId } = parsed
  const target = page.locator(`[data-terminal-tab-id="${tabId}"] [data-leaf-id="${leafId}"]`)
  const ptyId = await target.getAttribute('data-pty-id')
  expect(ptyId).toBeTruthy()
  const otherSplit = async () => {
    await page.evaluate(
      ({ tabId, leafId }) => {
        const manager = window.__paneManagers?.get(tabId)
        const other = manager?.getPanes().find((pane) => pane.leafId !== leafId)
        if (!manager || !other) {
          throw new Error('activity_menu_other_split_missing')
        }
        manager.setActivePane(other.id)
      },
      { tabId, leafId }
    )
  }
  const residentStart = async () => {
    await expect(target.locator('.xterm-helper-textarea')).not.toBeFocused()
    const activeLeafId = await page.evaluate(
      (tabId) => window.__paneManagers?.get(tabId)?.getActivePane()?.leafId,
      tabId
    )
    expect(activeLeafId).toBeTruthy()
    expect(activeLeafId).not.toBe(leafId)
    return activeLeafId
  }
  const arriveResident = async () => {
    const destination = await arriveWorkspace()
    await expect(target).toBeVisible()
    await expect(target).toHaveAttribute('data-pty-id', ptyId ?? '')
    await expect(target.locator('.xterm-screen')).toBeVisible()
    await expect(target.locator('.xterm-helper-textarea')).toBeFocused()
    return { ...destination, tabId, leafId, ptyId }
  }
  for (const surface of ['activity-page', 'sidebar-agents']) {
    const root = page.locator(`[data-activity-viewer="${surface}"]`)
    const run = (args: string[]) => call(['activity', ...args], surface)
    const open = async (title: string, paneKey: string) => {
      const source = root.locator('[data-activity-context-trigger]').filter({ hasText: title })
      await source.scrollIntoViewIfNeeded()
      await source.click({ button: 'right', position: { x: 30, y: 20 } })
      const owner = await source.getAttribute('data-activity-context-trigger')
      const menu = page.locator(`[data-activity-context-owner="${owner}"]`)
      await expect(menu).toBeVisible()
      await expect(menu).toHaveAttribute('data-activity-context-targets', JSON.stringify([paneKey]))
      return menu
    }
    for (const kind of ['closed', 'resident']) {
      const paneKey = kind === 'resident' ? residentKey : retainedKey
      const title = kind === 'resident' ? residentTitle : 'Activity task a'
      await showSource(surface)
      await otherSplit()
      const originalStart = await readStart()
      const originalActiveLeaf = kind === 'resident' ? await residentStart() : null
      const menu = await open(title, paneKey)
      const activation = await activateOriginal(
        menu.getByRole('menuitem').filter({ has: page.locator('svg.lucide-panel-right') })
      )
      await expect(menu).toHaveCount(0)
      const original = kind === 'resident' ? await arriveResident() : await arriveWorkspace()
      await workspace.screenshot({
        path: testInfo.outputPath(`${surface}-menu-open-${kind}-original.png`)
      })
      await showSource(surface)
      await otherSplit()
      await expect(menu).toHaveCount(0)
      const directStart = await readStart()
      const directActiveLeaf = kind === 'resident' ? await residentStart() : null
      expect(directActiveLeaf).toBe(originalActiveLeaf)
      const reply = await run(['select', '--pane', paneKey])
      expect(reply).toMatchObject({
        applied: kind === 'resident',
        navigationAction: {
          operation: 'select',
          paneKey,
          workspaceId: 'activity-wt-0',
          executionHostId: 'local',
          requestOutcome: kind === 'resident' ? 'terminal-focus-requested' : 'workspace-only',
          reached: kind === 'resident' ? 'terminal-pane' : 'workspace',
          remoteAck: 'unknown'
        }
      })
      const direct = kind === 'resident' ? await arriveResident() : await arriveWorkspace()
      expect(direct).toEqual(original)
      writeFileSync(
        testInfo.outputPath(`${surface}-menu-open-${kind}.json`),
        JSON.stringify(
          {
            original,
            direct,
            reply,
            originalStart,
            directStart,
            originalActiveLeaf,
            directActiveLeaf,
            activation,
            workspaceWasAlreadyActive: originalStart.workspaceId === directStart.workspaceId,
            reusedResident: { paneKey: residentKey, tabId, leafId, ptyId }
          },
          null,
          2
        )
      )
    }
    const prepareJump = async () => {
      await showSource(surface)
      await run(['mark-all-read'])
      await page.evaluate(
        (paneKey) => window.__store?.getState().unacknowledgeAgents([paneKey]),
        retainedKey
      )
      const menu = await open('Activity task a', retainedKey)
      await expect(menu.locator('[data-activity-context-action="read-toggle"]')).toHaveAttribute(
        'data-activity-context-read-operation',
        'read'
      )
      return menu
    }
    const observeRead = async () => {
      await showSource(surface)
      await run(['read', '--filter', 'unread'])
      await expect(root.getByRole('listitem')).toHaveCount(0)
      const result = await run(['get'])
      expect(result.rendered?.hasUnreadThreads).toBe(false)
      await run(['read', '--filter', 'all'])
      return { unreadRows: 0, hasUnreadThreads: result.rendered?.hasUnreadThreads }
    }
    const originalMenu = await prepareJump()
    const originalStart = await readStart()
    await originalMenu
      .getByRole('menuitem')
      .filter({ has: page.locator('svg.lucide-external-link') })
      .click()
    await expect(originalMenu).toHaveCount(0)
    const original = { destination: await arriveWorkspace(), read: await observeRead() }
    const cliMenu = await prepareJump()
    await cliMenu.press('Escape')
    await expect(cliMenu).toHaveCount(0)
    const directStart = await readStart()
    const reply = await run(['jump', '--pane', retainedKey])
    expect(reply).toMatchObject({
      applied: true,
      navigationAction: {
        operation: 'jump',
        paneKey: retainedKey,
        workspaceId: 'activity-wt-0',
        executionHostId: 'local',
        requestAccepted: true,
        reached: 'workspace',
        remoteAck: 'unknown'
      }
    })
    const direct = { destination: await arriveWorkspace(), read: await observeRead() }
    expect(direct).toEqual(original)
    writeFileSync(
      testInfo.outputPath(`${surface}-menu-jump.json`),
      JSON.stringify(
        {
          original,
          direct,
          reply,
          originalStart,
          directStart,
          workspaceWasAlreadyActive: originalStart.workspaceId === directStart.workspaceId
        },
        null,
        2
      )
    )
  }
}
