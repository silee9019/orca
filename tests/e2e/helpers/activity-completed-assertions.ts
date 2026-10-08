import { expect, type Page, type TestInfo } from '@playwright/test'
import type { ActivityViewerResult } from '../../../src/shared/activity-viewer-command'

export async function assertActivityCompleted(
  page: Page,
  call: (args: string[], surface?: string) => Promise<ActivityViewerResult>,
  testInfo: TestInfo
): Promise<void> {
  const a = 'activity-tab-a:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  const c = 'activity-tab-c:cccccccc-cccc-4ccc-8ccc-ccccccccccc1'
  for (const surface of ['activity-page', 'sidebar-agents']) {
    await page.evaluate((surface) => {
      const state = window.__store?.getState()
      state?.setActiveView(surface === 'activity-page' ? 'activity' : 'terminal')
      state?.setSidebarOpen(surface === 'sidebar-agents')
      state?.setSidebarBody('agents')
      const paneKey = 'activity-tab-c:cccccccc-cccc-4ccc-8ccc-ccccccccccc1'
      const retained = state?.retainedAgentsByPaneKey[paneKey]
      if (!state || !retained || !window.__store) {
        throw new Error('completed_fixture_missing')
      }
      window.__store.setState({
        retainedAgentsByPaneKey: {
          ...state.retainedAgentsByPaneKey,
          [paneKey]: { ...retained, entry: { ...retained.entry, state: 'done' } }
        }
      })
    }, surface)
    const list = page.locator(`[data-activity-viewer="${surface}"]`)
    const rows = list.getByRole('listitem')
    const run = (args: string[]) => call(['activity', ...args], surface)
    await expect(rows).toHaveCount(3)
    await run(['search', '--query', 'Activity task b'])
    await expect(rows).toHaveCount(1)
    expect(await run(['clear-completed'])).toMatchObject({
      applied: true,
      dispatched: false,
      persisted: null,
      writeOutcome: 'not_requested',
      completedAction: { paneKeys: [], remainingPaneKeys: [] }
    })
    await expect(rows.first()).toContainText('Activity task b')
    await run(['search', '--query', ''])
    await expect(rows).toHaveCount(3)
    await run(['search', '--query', 'Activity task a'])
    await expect(rows).toHaveCount(1)
    expect(await run(['clear-completed'])).toMatchObject({
      applied: true,
      dispatched: true,
      persisted: null,
      writeOutcome: 'not_requested',
      completedAction: { paneKeys: [a], remainingPaneKeys: [] }
    })
    await expect(rows).toHaveCount(0)
    await list.screenshot({ path: testInfo.outputPath(`${surface}-completed-cleared.png`) })
    await run(['search', '--query', ''])
    await expect(rows).toHaveCount(2)
    await expect(rows.filter({ hasText: 'Activity task c' })).toHaveCount(1)
    expect((await run(['get'])).rendered?.logicalRows.some((row) => row.key.includes(c))).toBe(true)
    await page.getByRole('button', { name: /^(Undo|끄르다|실행 취소|되돌리기)$/ }).click()
    await expect(rows).toHaveCount(3)
    await run(['search', '--query', 'Activity task a'])
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText('Activity task a')
    await list.screenshot({ path: testInfo.outputPath(`${surface}-completed-undo.png`) })
    await run(['search', '--query', ''])
    await expect(rows).toHaveCount(3)
    await run(['group', '--by', 'status'])
    const headers = list.getByRole('group').getByRole('button')
    await expect(headers).toHaveCount(2)
    for (let index = 0; index < 2; index += 1) {
      await headers.nth(index).click()
    }
    await expect(rows).toHaveCount(0)
    const cleared = await run(['clear-completed'])
    expect(cleared).toMatchObject({
      applied: true,
      dispatched: true,
      persisted: null,
      completedAction: { paneKeys: expect.arrayContaining([a, c]), remainingPaneKeys: [] }
    })
    expect(cleared.completedAction?.paneKeys).toHaveLength(2)
    await expect(headers).toHaveCount(1)
    await page.getByRole('button', { name: /^(Undo|끄르다|실행 취소|되돌리기)$/ }).click()
    await expect(headers).toHaveCount(2)
    const collapsed = list.getByRole('group').getByRole('button', { expanded: false })
    for (let index = 0; index < 2; index += 1) {
      await collapsed.first().click()
    }
    await expect(rows).toHaveCount(3)
    await run(['group', '--by', 'none'])
    await expect(rows).toHaveCount(3)
  }
}
