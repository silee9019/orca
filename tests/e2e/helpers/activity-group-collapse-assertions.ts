import { expect, type Page, type TestInfo } from '@playwright/test'
import type { ActivityViewerResult } from '../../../src/shared/activity-viewer-command'

export async function assertActivityGroupCollapse(
  page: Page,
  call: (args: string[], surface?: string) => Promise<ActivityViewerResult>,
  testInfo: TestInfo
): Promise<void> {
  for (const surface of ['activity-page', 'sidebar-agents']) {
    await page.evaluate((surface) => {
      const state = window.__store?.getState()
      state?.setActiveView(surface === 'activity-page' ? 'activity' : 'terminal')
      state?.setSidebarOpen(surface === 'sidebar-agents')
      state?.setSidebarBody('agents')
    }, surface)
    const run = (args: string[]) => call(['activity', ...args], surface)
    await run(['group', '--by', 'status'])
    const before = await run(['get'])
    const group = before.rendered?.groups?.find(
      (group) => !group.collapsed && group.threadCount > 0
    )
    if (!group) {
      throw new Error('activity_group_fixture_missing')
    }
    const root = page.locator(`[data-activity-viewer="${surface}"]`)
    const rowCount = before.rendered?.logicalRows.filter((row) => row.kind === 'thread').length ?? 0
    await expect(root.getByRole('listitem')).toHaveCount(rowCount)
    const header = root.locator(`[data-activity-sticky-header="${group.key}"] [role="button"]`)
    await expect(header).toHaveAttribute('aria-expanded', 'true')
    expect(await run(['group-toggle', '--group-key', group.key])).toMatchObject({
      applied: true,
      dispatched: true,
      persisted: null,
      writeOutcome: 'not_requested',
      groupAction: { key: group.key, requestedCollapsed: true, currentCollapsed: true }
    })
    await expect(header).toHaveAttribute('aria-expanded', 'false')
    await expect(root.getByRole('listitem')).toHaveCount(rowCount - group.threadCount)
    await root.screenshot({ path: testInfo.outputPath(`${surface}-group-collapsed.png`) })
    expect(await run(['group-toggle', '--group-key', group.key])).toMatchObject({
      applied: true,
      groupAction: { key: group.key, requestedCollapsed: false, currentCollapsed: false }
    })
    await expect(header).toHaveAttribute('aria-expanded', 'true')
    await expect(root.getByRole('listitem')).toHaveCount(rowCount)
    await run(['group', '--by', 'none'])
  }
}
