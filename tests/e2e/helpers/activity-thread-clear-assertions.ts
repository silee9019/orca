import { expect, type Page, type TestInfo } from '@playwright/test'
import type { ActivityViewerResult } from '../../../src/shared/activity-viewer-command'

export async function assertActivityThreadClear(
  page: Page,
  call: (args: string[], surface?: string) => Promise<ActivityViewerResult>,
  testInfo: TestInfo
): Promise<void> {
  const a = 'activity-tab-a:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  const b = 'activity-tab-b:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
  const c = 'activity-tab-c:cccccccc-cccc-4ccc-8ccc-ccccccccccc1'
  const retained = await page.evaluate(
    (key) => window.__store?.getState().retainedAgentsByPaneKey[key],
    c
  )
  if (!retained) {
    throw new Error('clear_fixture_missing')
  }
  const snapshot = { ...retained, entry: { ...retained.entry, state: 'done' as const } }
  for (const surface of ['activity-page', 'sidebar-agents']) {
    await page.evaluate(
      ({ surface, snapshot }) => {
        const state = window.__store?.getState()
        state?.setActiveView(surface === 'activity-page' ? 'activity' : 'terminal')
        state?.setSidebarOpen(surface === 'sidebar-agents')
        state?.setSidebarBody('agents')
        state?.applyActivityClearedAt({ [snapshot.entry.paneKey]: null })
        state?.clearRetentionSuppressedPaneKeys([snapshot.entry.paneKey])
        state?.retainAgents([snapshot])
      },
      { surface, snapshot }
    )
    const list = page.locator(`[data-activity-viewer="${surface}"]`)
    const rows = list.getByRole('listitem')
    const run = (args: string[]) => call(['activity', ...args], surface)
    await expect(rows).toHaveCount(3)
    await run(['search', '--query', 'Activity task b'])
    await expect(rows).toHaveCount(1)
    await expect(run(['clear-threads', '--panes', JSON.stringify([a, b])])).rejects.toThrow()
    await expect(rows.first()).toContainText('Activity task b')
    await run(['search', '--query', ''])
    await expect(rows).toHaveCount(3)
    expect(await run(['clear-threads', '--panes', JSON.stringify([a, b])])).toMatchObject({
      applied: true,
      dispatched: true,
      persisted: null,
      writeOutcome: 'not_requested',
      completedAction: { paneKeys: [a], remainingPaneKeys: [] }
    })
    await expect(rows).toHaveCount(2)
    await expect(rows.filter({ hasText: 'Activity task b' })).toHaveCount(1)
    await expect(rows.filter({ hasText: 'Activity task c' })).toHaveCount(1)
    const undo = page.getByRole('button', { name: /^(Undo|끄르다|실행 취소|되돌리기)$/ })
    await undo.click()
    await expect(rows).toHaveCount(3)
    await expect(undo).toHaveCount(0)
    expect(await run(['clear-thread', '--pane', b])).toMatchObject({
      applied: true,
      dispatched: false,
      persisted: null,
      completedAction: { paneKeys: [], remainingPaneKeys: [] }
    })
    await expect(rows).toHaveCount(3)
    expect(await run(['clear-thread', '--pane', c])).toMatchObject({
      applied: true,
      dispatched: true,
      persisted: null,
      writeOutcome: 'not_requested',
      completedAction: { paneKeys: [c], remainingPaneKeys: [] }
    })
    await expect(rows).toHaveCount(2)
    await expect(rows.filter({ hasText: 'Activity task a' })).toHaveCount(1)
    await expect(rows.filter({ hasText: 'Activity task b' })).toHaveCount(1)
    await expect(undo).toHaveCount(0)
    await list.screenshot({ path: testInfo.outputPath(`${surface}-single-cleared.png`) })
    await page.evaluate((snapshot) => {
      const state = window.__store?.getState()
      state?.applyActivityClearedAt({ [snapshot.entry.paneKey]: null })
      state?.clearRetentionSuppressedPaneKeys([snapshot.entry.paneKey])
      state?.retainAgents([snapshot])
    }, snapshot)
    await expect(rows).toHaveCount(3)
  }
}
