import { expect, type ElectronApplication, type Page, type TestInfo } from '@playwright/test'
import type { ActivityViewerResult } from '../../../src/shared/activity-viewer-command'

export async function assertActivityCopy(
  electronApp: ElectronApplication,
  page: Page,
  call: (args: string[], surface?: string) => Promise<ActivityViewerResult>,
  testInfo: TestInfo
): Promise<void> {
  // This isolated provider keeps the desktop clipboard untouched while exercising both IPC paths.
  await electronApp.evaluate(({ ipcMain }) => {
    let text = ''
    ipcMain.removeHandler('clipboard:writeText')
    ipcMain.removeHandler('clipboard:readText')
    ipcMain.handle('clipboard:writeText', (_event, value: string) => {
      text = value
    })
    ipcMain.handle('clipboard:readText', () => text)
  })
  const paneKey = 'activity-tab-a:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  for (const surface of ['activity-page', 'sidebar-agents']) {
    await page.evaluate((surface) => {
      const state = window.__store?.getState()
      state?.setActiveView(surface === 'activity-page' ? 'activity' : 'terminal')
      state?.setSidebarOpen(surface === 'sidebar-agents')
      state?.setSidebarBody('agents')
    }, surface)
    const list = page.locator(`[data-activity-viewer="${surface}"]`)
    const row = list.locator('[data-activity-viewer-thread]').filter({ hasText: 'Activity task a' })
    await expect(row).toBeVisible()
    for (const kind of ['title', 'path']) {
      await page.evaluate(() => window.api.ui.writeClipboardText('fixture-before-menu'))
      await row.getByRole('listitem').dispatchEvent('contextmenu', { button: 2, bubbles: true })
      const item = page.locator(`[data-activity-copy-kind="${kind}"]`)
      await expect(item).toBeVisible()
      await item.click()
      await expect
        .poll(() => page.evaluate(() => window.api.ui.readClipboardText()))
        .not.toBe('fixture-before-menu')
      const original = await page.evaluate(() => window.api.ui.readClipboardText())
      expect(original.length).toBeGreaterThan(0)
      await page.evaluate(() => window.api.ui.writeClipboardText('fixture-before-cli'))
      const result = await call(['activity', 'copy', '--pane', paneKey, '--kind', kind], surface)
      expect(result).toMatchObject({
        applied: true,
        persisted: null,
        writeOutcome: 'not_requested',
        copyAction: { paneKey, kind, writeAcknowledged: true, verified: true }
      })
      expect(result.copyAction).not.toHaveProperty('value')
      expect(await page.evaluate(() => window.api.ui.readClipboardText())).toBe(original)
    }
    await list.screenshot({ path: testInfo.outputPath(`${surface}-copy-verified.png`) })
  }
}
