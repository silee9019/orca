import { expect, type Page, type TestInfo } from '@playwright/test'
import type { ActivityViewerResult } from '../../../src/shared/activity-viewer-command'

export async function assertActivityPreview(
  page: Page,
  call: (args: string[], surface?: string) => Promise<ActivityViewerResult>,
  testInfo: TestInfo
): Promise<void> {
  const paneKey = 'activity-tab-a:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  for (const surface of ['activity-page', 'sidebar-agents']) {
    await page.evaluate((surface) => {
      const state = window.__store?.getState()
      state?.setActiveView(surface === 'activity-page' ? 'activity' : 'terminal')
      state?.setSidebarOpen(surface === 'sidebar-agents')
      state?.setSidebarBody('agents')
    }, surface)
    const list = page.locator(`[data-activity-viewer="${surface}"]`)
    const row = list
      .locator('[data-activity-viewer-thread]')
      .filter({ hasText: 'Activity task a' })
      .getByRole('listitem')
    await expect(row).toBeVisible()
    const owner = await row.getAttribute('data-activity-preview-trigger')
    expect(owner).toBeTruthy()
    const portal = page.locator(`[data-activity-preview-owner="${owner}"]`)
    const selected = await row.getAttribute('aria-current')
    const labels = await row
      .locator('button')
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')))
    const initial = await call(['activity', 'get'], surface)
    const logical = initial.rendered?.logicalRows.find((item) => item.key === `t:${paneKey}`)
    expect(logical).toBeDefined()
    expect(
      await call(['activity', 'preview', '--pane', paneKey, '--enabled', 'true'], surface)
    ).toMatchObject({
      applied: true,
      persisted: null,
      writeOutcome: 'not_requested',
      previewAction: { paneKey, enabled: true, visible: true }
    })
    await expect(portal).toBeVisible()
    await expect(portal).toHaveAttribute('data-activity-preview-pane', paneKey)
    await expect(portal).toHaveAttribute(
      'data-activity-preview-workspace',
      logical?.workspaceId ?? ''
    )
    await expect(portal).toHaveAttribute('data-activity-preview-host', logical?.hostId ?? '')
    await expect(portal).toContainText('Activity task a')
    const copy = portal.locator('[data-activity-preview-copy-path] button')
    await expect(copy).toBeVisible()
    await page.evaluate(() => window.api.ui.writeClipboardText('fixture-before-preview-button'))
    const toast = page.locator('[data-sonner-toast][data-type="success"]')
    await expect(toast).toHaveCount(0, { timeout: 15000 })
    await copy.click()
    await expect
      .poll(() => page.evaluate(() => window.api.ui.readClipboardText()))
      .not.toBe('fixture-before-preview-button')
    const original = await page.evaluate(() => window.api.ui.readClipboardText())
    await expect(toast).toHaveCount(1)
    await expect(toast).toBeVisible()
    const originalToast = await toast.innerText()
    await expect(toast).toHaveCount(0, { timeout: 15000 })
    await page.evaluate(() => window.api.ui.writeClipboardText('fixture-before-preview-cli'))
    expect(await call(['activity', 'preview-copy-path', '--pane', paneKey], surface)).toMatchObject(
      {
        applied: true,
        persisted: null,
        writeOutcome: 'not_requested',
        copyAction: { paneKey, kind: 'path', writeAcknowledged: true, verified: true }
      }
    )
    expect(await page.evaluate(() => window.api.ui.readClipboardText())).toBe(original)
    await expect(toast).toHaveCount(1)
    await expect(toast).toBeVisible()
    await expect(toast).toHaveText(originalToast)
    await page.screenshot({ path: testInfo.outputPath(`${surface}-preview-copy-toast.png`) })
    await portal.screenshot({ path: testInfo.outputPath(`${surface}-preview-copy-verified.png`) })
    await portal.screenshot({ path: testInfo.outputPath(`${surface}-preview-open.png`) })
    expect(
      await call(['activity', 'preview', '--pane', paneKey, '--enabled', 'false'], surface)
    ).toMatchObject({
      applied: true,
      persisted: null,
      previewAction: { paneKey, enabled: false, visible: false }
    })
    await expect(portal).toHaveCount(0)
    await expect(row).toHaveAttribute('data-state', 'closed')
    expect(await row.getAttribute('aria-current')).toBe(selected)
    expect(
      await row
        .locator('button')
        .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')))
    ).toEqual(labels)
  }
}
