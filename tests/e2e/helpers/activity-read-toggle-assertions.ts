import { expect, type Page, type TestInfo } from '@playwright/test'
import type { ActivityViewerResult } from '../../../src/shared/activity-viewer-command'

export async function assertActivityReadToggle(
  page: Page,
  call: (args: string[], surface?: string) => Promise<ActivityViewerResult>,
  testInfo: TestInfo
): Promise<void> {
  const a = 'activity-tab-a:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  const b = 'activity-tab-b:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
  for (const surface of ['activity-page', 'sidebar-agents']) {
    await page.evaluate((surface) => {
      const state = window.__store?.getState()
      state?.setActiveView(surface === 'activity-page' ? 'activity' : 'terminal')
      state?.setSidebarOpen(surface === 'sidebar-agents')
      state?.setSidebarBody('agents')
    }, surface)
    const list = page.locator(`[data-activity-viewer="${surface}"]`)
    const rows = list.getByRole('listitem')
    const run = (args: string[]) => call(['activity', ...args], surface)
    await expect(rows).toHaveCount(3)
    expect(await run(['read-toggle', '--pane', b])).toMatchObject({
      applied: true,
      dispatched: true,
      persisted: null,
      writeOutcome: 'not_requested',
      readAction: { operation: 'unread', paneKeys: [b] },
      readStates: [{ paneKey: b, unread: true }]
    })
    await run(['read', '--filter', 'unread'])
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText('Activity task b')
    expect(await run(['read-toggle', '--pane', b])).toMatchObject({
      applied: true,
      readAction: { operation: 'read', paneKeys: [b] },
      readStates: [{ paneKey: b, unread: false }]
    })
    await expect(rows).toHaveCount(0)
    await run(['read', '--filter', 'all'])
    await expect(rows).toHaveCount(3)
    await page.evaluate((paneKey) => window.__store?.getState().unacknowledgeAgents([paneKey]), a)
    await run(['read', '--filter', 'unread'])
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText('Activity task a')
    await run(['read', '--filter', 'all'])
    expect(await run(['read-toggle-many', '--panes', JSON.stringify([a, b])])).toMatchObject({
      applied: true,
      dispatched: true,
      readAction: { operation: 'read', paneKeys: [a] },
      readStates: [{ paneKey: a, unread: false }]
    })
    await run(['read', '--filter', 'unread'])
    await expect(rows).toHaveCount(0)
    await run(['read', '--filter', 'all'])
    expect(await run(['read-toggle-many', '--panes', JSON.stringify([a, b])])).toMatchObject({
      applied: true,
      readAction: { operation: 'unread', paneKeys: [a, b] },
      readStates: [
        { paneKey: a, unread: true },
        { paneKey: b, unread: true }
      ]
    })
    await run(['read', '--filter', 'unread'])
    await expect(rows).toHaveCount(2)
    await list.screenshot({ path: testInfo.outputPath(`${surface}-read-toggle-many.png`) })
    await run(['read', '--filter', 'all'])
    await run(['mark-all-read'])
    await run(['search', '--query', 'Activity task b'])
    await expect(rows).toHaveCount(1)
    await expect(run(['read-toggle-many', '--panes', JSON.stringify([a, b])])).rejects.toThrow()
    await expect(rows).toHaveCount(1)
    expect(await run(['get'])).toMatchObject({ rendered: { hasUnreadThreads: false } })
    await run(['search', '--query', ''])
    await run(['read', '--filter', 'unread'])
    await expect(rows).toHaveCount(0)
    await run(['read', '--filter', 'all'])
    await expect(rows).toHaveCount(3)
  }
}
