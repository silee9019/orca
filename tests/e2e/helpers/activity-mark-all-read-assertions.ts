import { expect, type Page, type TestInfo } from '@playwright/test'
import type { ActivityViewerResult } from '../../../src/shared/activity-viewer-command'

export async function assertActivityMarkAllRead(
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
      state?.unacknowledgeAgents([
        'activity-tab-a:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
        'activity-tab-c:cccccccc-cccc-4ccc-8ccc-ccccccccccc1'
      ])
    }, surface)
    const list = page.locator(`[data-activity-viewer="${surface}"]`)
    const rows = list.getByRole('listitem')
    const run = (args: string[]) => call(['activity', ...args], surface)
    await expect(rows).toHaveCount(3)
    await run(['search', '--query', 'Activity task b'])
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText('Activity task b')
    expect(await run(['get'])).toMatchObject({ rendered: { hasUnreadThreads: true } })
    expect(await run(['mark-all-read'])).toMatchObject({
      applied: true,
      dispatched: true,
      persisted: null,
      writeOutcome: 'not_requested',
      rendered: { hasUnreadThreads: false, query: 'Activity task b' }
    })
    await expect(rows).toHaveCount(1)
    if (surface === 'activity-page') {
      await expect(
        list.getByRole('button', { name: /Mark all read|모두 읽은 것으로 표시/ })
      ).toBeDisabled()
    }
    await list.screenshot({ path: testInfo.outputPath(`${surface}-mark-all-hidden-unread.png`) })
    await run(['search', '--query', ''])
    await run(['read', '--filter', 'unread'])
    await expect(rows).toHaveCount(0)
    await run(['read', '--filter', 'all'])
    await expect(rows).toHaveCount(3)
    expect(await run(['mark-all-read'])).toMatchObject({
      applied: true,
      dispatched: false,
      persisted: null,
      writeOutcome: 'not_requested',
      rendered: { hasUnreadThreads: false }
    })
  }
}
