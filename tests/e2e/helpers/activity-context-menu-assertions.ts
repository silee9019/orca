import { writeFileSync } from 'node:fs'
import { expect, type Page, type TestInfo } from '@playwright/test'
import type { ActivityViewerResult } from '../../../src/shared/activity-viewer-command'

export async function assertActivityContextMenu(
  page: Page,
  call: (args: string[], surface?: string) => Promise<ActivityViewerResult>,
  testInfo: TestInfo
): Promise<void> {
  const paneKey = 'activity-tab-a:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  const secondKey = 'activity-tab-b:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
  for (const surface of ['activity-page', 'sidebar-agents']) {
    await page.evaluate((surface) => {
      const state = window.__store?.getState()
      state?.setActiveView(surface === 'activity-page' ? 'activity' : 'terminal')
      state?.setSidebarOpen(surface === 'sidebar-agents')
      state?.setSidebarBody('agents')
    }, surface)
    const root = page.locator(`[data-activity-viewer="${surface}"]`)
    const source = root
      .locator('[data-activity-context-trigger]')
      .filter({ hasText: 'Activity task a' })
    const second = root
      .locator('[data-activity-context-trigger]')
      .filter({ hasText: 'Activity task b' })
    const owner = await source.getAttribute('data-activity-context-trigger')
    const menu = page.locator(`[data-activity-context-owner="${owner}"]`)
    const row = source.getByRole('listitem')
    const previewOwner = await row.getAttribute('data-activity-preview-trigger')
    const preview = page.locator(`[data-activity-preview-owner="${previewOwner}"]`)
    const setMenu = (enabled: boolean) =>
      call(['activity', 'context-menu', '--pane', paneKey, '--enabled', String(enabled)], surface)
    const prepare = async (bulk: boolean) => {
      await source.scrollIntoViewIfNeeded()
      await page.mouse.click(1, 1)
      if (bulk) {
        const modifier = await page.evaluate(() =>
          navigator.userAgent.includes('Mac') ? 'Meta' : 'Control'
        )
        await row.click({ modifiers: [modifier] })
        await second.getByRole('listitem').click({ modifiers: [modifier] })
      }
    }
    for (const bulk of [false, true]) {
      await prepare(bulk)
      await source.click({ button: 'right', position: { x: 30, y: 20 } })
      await expect(menu).toBeVisible()
      const original = await menu.evaluate((node) => ({
        snapshot: JSON.parse(node.getAttribute('data-activity-context-targets') ?? 'null'),
        items: [...node.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent),
        focusInside: node.contains(document.activeElement)
      }))
      expect([...original.snapshot].sort()).toEqual(
        (bulk ? [paneKey, secondKey] : [paneKey]).sort()
      )
      await menu.screenshot({
        path: testInfo.outputPath(`${surface}-context-${bulk ? 'bulk' : 'single'}-original.png`)
      })
      await menu.press('Escape')
      await expect(menu).toHaveCount(0)
      const originalFocusOnRow = await row.evaluate((node) => node.contains(document.activeElement))
      expect(originalFocusOnRow).toBe(false)
      await prepare(bulk)
      expect(await setMenu(false)).toMatchObject({
        applied: true,
        contextMenuAction: { visible: false, targetPaneKeys: [] }
      })
      const opened = await setMenu(true)
      expect(opened).toMatchObject({
        applied: true,
        contextMenuAction: {
          paneKey,
          enabled: true,
          visible: true,
          targetPaneKeys: original.snapshot
        }
      })
      await expect(menu).toBeVisible()
      await expect(preview).toHaveCount(0)
      expect(await menu.getByRole('menuitem').allTextContents()).toEqual(original.items)
      const snapshot = await menu.getAttribute('data-activity-context-targets')
      expect(await setMenu(true)).toMatchObject({
        applied: true,
        contextMenuAction: { targetPaneKeys: original.snapshot }
      })
      await expect(menu).toHaveAttribute('data-activity-context-targets', snapshot ?? '')
      await menu.screenshot({
        path: testInfo.outputPath(`${surface}-context-${bulk ? 'bulk' : 'single'}-cli.png`)
      })
      // A separate visible overlay must survive a refused close.
      await page.evaluate(() => {
        const overlay = document.createElement('div')
        overlay.id = 'context-fixture-overlay'
        overlay.setAttribute('role', 'dialog')
        overlay.style.cssText = 'position:fixed;left:0;top:0;width:20px;height:20px'
        document.body.append(overlay)
      })
      await expect(setMenu(false)).rejects.toThrow()
      await expect(page.locator('#context-fixture-overlay')).toHaveCount(1)
      await expect(menu).toBeVisible()
      await page.locator('#context-fixture-overlay').evaluate((node) => node.remove())
      const closed = await setMenu(false)
      expect(closed).toMatchObject({
        applied: true,
        persisted: null,
        writeOutcome: 'not_requested',
        contextMenuAction: { enabled: false, visible: false, targetPaneKeys: original.snapshot }
      })
      await expect(menu).toHaveCount(0)
      expect(await row.evaluate((node) => node.contains(document.activeElement))).toBe(
        originalFocusOnRow
      )
      await expect(preview).toHaveCount(0)
      writeFileSync(
        testInfo.outputPath(`${surface}-context-${bulk ? 'bulk' : 'single'}.json`),
        JSON.stringify({ original, opened, closed, originalFocusOnRow }, null, 2)
      )
    }
  }
}
