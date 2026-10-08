import { writeFileSync } from 'node:fs'
import { expect, type Page, type TestInfo } from '@playwright/test'
import type { ActivityViewerResult } from '../../../src/shared/activity-viewer-command'

export async function assertActivityContextMenuClear(
  page: Page,
  call: (args: string[], surface?: string) => Promise<ActivityViewerResult>,
  testInfo: TestInfo
): Promise<void> {
  const a = 'activity-tab-a:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  const b = 'activity-tab-b:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
  const c = 'activity-tab-c:cccccccc-cccc-4ccc-8ccc-ccccccccccc1'
  const snapshots = await page.evaluate(
    ({ a, c }) => {
      const state = window.__store?.getState()
      const first = state?.retainedAgentsByPaneKey[a]
      const third = state?.retainedAgentsByPaneKey[c]
      if (!first || !third) {
        throw new Error('activity_menu_clear_fixture_missing')
      }
      return {
        first: { ...first, entry: { ...first.entry, state: 'done' as const } },
        third: { ...third, entry: { ...third.entry, state: 'done' as const } }
      }
    },
    { a, c }
  )
  for (const surface of ['activity-page', 'sidebar-agents']) {
    await page.evaluate(() => window.__store?.getState().setActiveView('terminal'))
    await page.evaluate(
      ({ surface, snapshots, a, c }) => {
        const state = window.__store?.getState()
        state?.setActiveView(surface === 'activity-page' ? 'activity' : 'terminal')
        state?.setSidebarOpen(surface === 'sidebar-agents')
        state?.setSidebarBody('agents')
        state?.applyActivityClearedAt({ [a]: null, [c]: null })
        state?.clearRetentionSuppressedPaneKeys([a, c])
        state?.retainAgents([snapshots.first, snapshots.third])
      },
      { surface, snapshots, a, c }
    )
    const root = page.locator(`[data-activity-viewer="${surface}"]`)
    const source = (title: string) =>
      root.locator('[data-activity-context-trigger]').filter({ hasText: title })
    const run = (args: string[]) => call(['activity', ...args], surface)
    await run(['scope-reset'])
    await run(['search', '--query', ''])
    await run(['read', '--filter', 'all'])
    await run(['group', '--by', 'none'])
    const keys = async () => {
      const result = await run(['get'])
      expect(result.applied).toBe(true)
      if (!result.rendered) {
        throw new Error('activity_menu_clear_surface_missing')
      }
      return result.rendered.logicalRows
        .filter((row) => row.kind === 'thread')
        .map((row) => row.key)
        .sort()
    }
    const baseline = await keys()
    expect(baseline).toEqual(expect.arrayContaining([`t:${a}`, `t:${b}`, `t:${c}`]))
    const undo = page.getByRole('button', { name: /^(Undo|끄르다|실행 취소|되돌리기)$/ })
    await expect(undo).toHaveCount(0)
    const restore = async () => {
      await page.evaluate(
        ({ snapshots, a, c }) => {
          const state = window.__store?.getState()
          state?.applyActivityClearedAt({ [a]: null, [c]: null })
          state?.clearRetentionSuppressedPaneKeys([a, c])
          state?.retainAgents([snapshots.first, snapshots.third])
        },
        { snapshots, a, c }
      )
      expect(await keys()).toEqual(baseline)
      await expect(undo).toHaveCount(0)
    }
    const open = async (title: string) => {
      const trigger = source(title)
      await trigger.scrollIntoViewIfNeeded()
      await trigger.click({ button: 'right', position: { x: 30, y: 20 } })
      const owner = await trigger.getAttribute('data-activity-context-trigger')
      const menu = page.locator(`[data-activity-context-owner="${owner}"]`)
      await expect(menu).toBeVisible()
      return menu
    }
    await page.mouse.click(1, 1)
    const singleMenu = await open('Activity task c')
    await expect(singleMenu).toHaveAttribute('data-activity-context-targets', JSON.stringify([c]))
    await singleMenu
      .getByRole('menuitem')
      .filter({ has: page.locator('svg.lucide-x') })
      .click()
    await expect(singleMenu).toHaveCount(0)
    const originalSingle = await keys()
    expect(originalSingle).toEqual(baseline.filter((key) => key !== `t:${c}`))
    await expect(undo).toHaveCount(0)
    await root.screenshot({
      path: testInfo.outputPath(`${surface}-menu-single-clear-original.png`)
    })
    await restore()
    const singleReply = await run(['clear-thread', '--pane', c])
    expect(singleReply).toMatchObject({
      applied: true,
      completedAction: { paneKeys: [c], remainingPaneKeys: [] }
    })
    expect(await keys()).toEqual(originalSingle)
    await expect(undo).toHaveCount(0)
    await restore()
    const modifier = await page.evaluate(() =>
      navigator.userAgent.includes('Mac') ? 'Meta' : 'Control'
    )
    await page.mouse.click(1, 1)
    await source('Activity task a')
      .getByRole('listitem')
      .click({ modifiers: [modifier] })
    await source('Activity task b')
      .getByRole('listitem')
      .click({ modifiers: [modifier] })
    const bulkMenu = await open('Activity task a')
    const targets = JSON.parse(
      (await bulkMenu.getAttribute('data-activity-context-targets')) ?? 'null'
    )
    expect([...targets].sort()).toEqual([a, b].sort())
    await bulkMenu
      .getByRole('menuitem')
      .filter({ has: page.locator('svg.lucide-x') })
      .click()
    await expect(bulkMenu).toHaveCount(0)
    const originalBulk = await keys()
    expect(originalBulk).toEqual(baseline.filter((key) => key !== `t:${a}`))
    await expect(undo).toHaveCount(1)
    await root.screenshot({ path: testInfo.outputPath(`${surface}-menu-bulk-clear-original.png`) })
    await undo.click()
    await expect(undo).toHaveCount(0)
    expect(await keys()).toEqual(baseline)
    const bulkReply = await run(['clear-threads', '--panes', JSON.stringify(targets)])
    expect(bulkReply).toMatchObject({
      applied: true,
      completedAction: { paneKeys: [a], remainingPaneKeys: [] }
    })
    expect(await keys()).toEqual(originalBulk)
    await expect(bulkMenu).toHaveCount(0)
    await expect(undo).toHaveCount(1)
    await undo.click()
    await expect(undo).toHaveCount(0)
    expect(await keys()).toEqual(baseline)
    writeFileSync(
      testInfo.outputPath(`${surface}-menu-clear.json`),
      JSON.stringify(
        {
          baseline,
          originalSingle,
          originalBulk,
          targets,
          singleReply,
          bulkReply,
          undoRestored: true
        },
        null,
        2
      )
    )
  }
}
