import { expect, type Page, type TestInfo } from '@playwright/test'
import type { ActivityViewerResult } from '../../../src/shared/activity-viewer-command'

export async function assertActivityJump(
  page: Page,
  call: (args: string[], surface?: string) => Promise<ActivityViewerResult>,
  testInfo: TestInfo
): Promise<void> {
  const paneKey = 'activity-tab-a:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  await page.evaluate(() => {
    const state = window.__store?.getState()
    for (const id of ['activity-wt-0', 'activity-wt-1']) {
      state?.createTab(id)
    }
  })
  for (const surface of ['activity-page', 'sidebar-agents']) {
    await page.evaluate(
      ({ surface, paneKey }) => {
        const state = window.__store?.getState()
        if (!state) {
          throw new Error('jump_fixture_missing')
        }
        state.setActiveView(surface === 'activity-page' ? 'activity' : 'terminal')
        state.setSidebarOpen(surface === 'sidebar-agents')
        state.setSidebarBody('agents')
        state.acknowledgeAgents(
          Object.keys(state.retainedAgentsByPaneKey).filter((key) => key !== paneKey)
        )
        state.unacknowledgeAgents([paneKey])
      },
      { surface, paneKey }
    )
    const list = page.locator(`[data-activity-viewer="${surface}"]`)
    const run = (args: string[]) => call(['activity', ...args], surface)
    await expect(list.getByRole('listitem')).toHaveCount(3)
    await run(['read', '--filter', 'unread'])
    await expect(list.getByRole('listitem')).toHaveCount(1)
    await expect(list.getByRole('listitem').first()).toContainText('Activity task a')
    const result = await run(['jump', '--pane', paneKey])
    expect(result).toMatchObject({
      applied: true,
      dispatched: true,
      persisted: null,
      writeOutcome: 'not_requested',
      navigationAction: {
        operation: 'jump',
        paneKey,
        workspaceId: 'activity-wt-0',
        executionHostId: 'local',
        requestAccepted: true,
        reached: 'workspace',
        remoteAck: 'unknown'
      }
    })
    const workspace = page.locator(
      '[data-rendered-active-worktree-id="activity-wt-0"][data-rendered-active-execution-host-id="local"]'
    )
    await expect(workspace).toBeVisible()
    await expect(
      workspace.locator('xpath=ancestor::*[@data-terminal-workbench-container]')
    ).toHaveAttribute('aria-hidden', 'false')
    await workspace.screenshot({ path: testInfo.outputPath(`${surface}-jump-workspace.png`) })
    await page.evaluate((surface) => {
      const state = window.__store?.getState()
      state?.setActiveView(surface === 'activity-page' ? 'activity' : 'terminal')
      state?.setSidebarOpen(surface === 'sidebar-agents')
      state?.setSidebarBody('agents')
    }, surface)
    await expect(list.getByRole('listitem')).toHaveCount(0)
    expect((await run(['get'])).rendered?.logicalRows).toEqual([])
    await run(['read', '--filter', 'all'])
    await expect(list.getByRole('listitem')).toHaveCount(3)
  }
}
