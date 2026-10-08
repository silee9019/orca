import { expect, type Page, type TestInfo } from '@playwright/test'
import type { ActivityViewerResult } from '../../../src/shared/activity-viewer-command'

export async function assertActivitySelect(
  page: Page,
  call: (args: string[], surface?: string) => Promise<ActivityViewerResult>,
  testInfo: TestInfo
): Promise<void> {
  const showSource = async (surface: string) => {
    await page.evaluate((surface) => {
      const state = window.__store?.getState()
      state?.setActiveView(surface === 'activity-page' ? 'activity' : 'terminal')
      state?.setSidebarOpen(surface === 'sidebar-agents')
      state?.setSidebarBody('agents')
    }, surface)
  }
  for (const surface of ['activity-page', 'sidebar-agents']) {
    await showSource(surface)
    const list = page.locator(`[data-activity-viewer="${surface}"]`)
    await expect(list.getByRole('listitem').filter({ hasText: 'Activity task a' })).toHaveCount(1)
    const result = await call(
      ['activity', 'select', '--pane', 'activity-tab-a:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'],
      surface
    )
    expect(result).toMatchObject({
      applied: false,
      dispatched: true,
      navigationAction: {
        operation: 'select',
        requestOutcome: 'workspace-only',
        reached: 'workspace',
        remoteAck: 'unknown'
      }
    })
    await expect(
      page.locator(
        '[data-rendered-active-worktree-id="activity-wt-0"][data-rendered-active-execution-host-id="local"]'
      )
    ).toBeVisible()
  }
  const tabId = await page.evaluate(() => {
    const state = window.__store?.getState()
    if (!state) {
      throw new Error('select_fixture_missing')
    }
    const tab = state.createTab('activity-wt-0')
    state.setActiveTab(tab.id)
    state.setActiveTabType('terminal', 'activity-wt-0')
    return tab.id
  })
  await page.waitForFunction(
    (tabId) =>
      window.__paneManagers
        ?.get(tabId)
        ?.getPanes()
        .some((pane) => pane.container.dataset.ptyId),
    tabId
  )
  const leafId = await page.evaluate((tabId) => {
    const manager = window.__paneManagers?.get(tabId)
    const first = manager?.getPanes()[0]
    if (!manager || !first) {
      throw new Error('select_fixture_pane_missing')
    }
    manager.splitPane(first.id, 'vertical')
    return first.leafId
  }, tabId)
  const paneKey = `${tabId}:${leafId}`
  await page.waitForFunction(
    (tabId) =>
      window.__paneManagers
        ?.get(tabId)
        ?.getPanes()
        .filter((pane) => pane.container.dataset.ptyId).length === 2,
    tabId
  )
  await page.evaluate((paneKey) => {
    const state = window.__store?.getState()
    state?.setAgentStatus(
      paneKey,
      {
        state: 'done',
        prompt: 'CLI select exact resident target',
        agentType: 'codex',
        lastAssistantMessage: 'Fixture completed.'
      },
      'CLI select target'
    )
  }, paneKey)
  for (const surface of ['activity-page', 'sidebar-agents']) {
    // Fixture setup establishes a different focused split before the command.
    await page.evaluate(
      ({ tabId, leafId }) => {
        const manager = window.__paneManagers?.get(tabId)
        const other = manager?.getPanes().find((pane) => pane.leafId !== leafId)
        if (!manager || !other) {
          throw new Error('select_fixture_other_pane_missing')
        }
        manager.setActivePane(other.id)
      },
      { tabId, leafId }
    )
    await showSource(surface)
    const list = page.locator(`[data-activity-viewer="${surface}"]`)
    await expect(
      list.getByRole('listitem').filter({ hasText: 'CLI select exact resident target' })
    ).toHaveCount(1)
    const result = await call(['activity', 'select', '--pane', paneKey], surface)
    expect(result).toMatchObject({
      applied: true,
      dispatched: true,
      navigationAction: {
        operation: 'select',
        paneKey,
        workspaceId: 'activity-wt-0',
        executionHostId: 'local',
        requestOutcome: 'terminal-focus-requested',
        reached: 'terminal-pane',
        remoteAck: 'unknown'
      }
    })
    const target = page.locator(`[data-terminal-tab-id="${tabId}"] [data-leaf-id="${leafId}"]`)
    await expect(target).toBeVisible()
    await expect(target).toHaveAttribute('data-pty-id', /.+/)
    await expect(target.locator('.xterm-screen')).toBeVisible()
    await expect(target.locator('.xterm-helper-textarea')).toBeFocused()
    await target.screenshot({ path: testInfo.outputPath(`${surface}-select-exact-pane.png`) })
  }
}
