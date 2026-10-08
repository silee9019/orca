import { writeFileSync } from 'node:fs'
import { expect, type Page, type TestInfo } from '@playwright/test'
import type { ActivityViewerResult } from '../../../src/shared/activity-viewer-command'
export async function assertActivityPreviewIssueCopy(
  page: Page,
  call: (args: string[], surface?: string) => Promise<ActivityViewerResult>,
  testInfo: TestInfo
): Promise<void> {
  const paneKey = 'activity-tab-a:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  const captureToasts = () => page.locator('[data-sonner-toast]').elementHandles()
  const expectNewCopyToast = async (previous: Awaited<ReturnType<typeof captureToasts>>) => {
    await expect
      .poll(() =>
        page.evaluate(
          (old) =>
            [...document.querySelectorAll<HTMLElement>('[data-sonner-toast]')].some(
              (node) =>
                !old.includes(node) &&
                /Issue link copied|이슈 링크 복사됨/.test(node.textContent ?? '')
            ),
          previous
        )
      )
      .toBe(true)
    for (const handle of previous) {
      await handle.dispose()
    }
  }

  for (const surface of ['activity-page', 'sidebar-agents']) {
    await page.evaluate((surface) => {
      const state = window.__store?.getState()
      state?.setActiveView(surface === 'activity-page' ? 'activity' : 'terminal')
      state?.setSidebarOpen(surface === 'sidebar-agents')
      state?.setSidebarBody('agents')
    }, surface)
    const row = page
      .locator(`[data-activity-viewer="${surface}"] [data-activity-viewer-thread]`)
      .filter({ hasText: 'Activity task a' })
      .getByRole('listitem')
    const owner = await row.getAttribute('data-activity-preview-trigger')
    const preview = page.locator(`[data-activity-preview-owner="${owner}"]`)
    const trigger = preview.locator('button[aria-haspopup="menu"]')
    const openPreview = async (path: string) => {
      expect(
        await call(['activity', 'preview', '--pane', paneKey, '--enabled', 'true'], surface)
      ).toMatchObject({ applied: true })
      await expect(trigger).toHaveCount(1)
      const before = await trigger.boundingBox()
      await trigger.scrollIntoViewIfNeeded()
      await expect(trigger).toBeVisible()
      const after = await trigger.boundingBox()
      writeFileSync(
        testInfo.outputPath(`${surface}-issue-copy-${path}-trigger-bounds.json`),
        JSON.stringify({ before, after, preview: await preview.boundingBox() }, null, 2)
      )
    }
    await openPreview('original')
    await trigger.press('Enter')
    const menuId = await trigger.getAttribute('aria-controls')
    const triggerId = await trigger.getAttribute('id')
    const menu = page.locator(`[role="menu"][id="${menuId}"]`)
    await expect(menu).toBeVisible()
    const copyItem = menu.getByRole('menuitem').last()
    expect(['Copy link', '링크 복사']).toContain(await copyItem.textContent())
    await menu.screenshot({ path: testInfo.outputPath(`${surface}-issue-copy-original-menu.png`) })
    await page.evaluate(() =>
      window.api.ui.writeClipboardText('fixture-before-original-issue-copy')
    )
    const originalToasts = await captureToasts()
    await copyItem.click()
    await expectNewCopyToast(originalToasts)
    await expect
      .poll(() => page.evaluate(() => window.api.ui.readClipboardText()))
      .not.toBe('fixture-before-original-issue-copy')
    const original = await page.evaluate(() => window.api.ui.readClipboardText())
    expect(original).toMatch(/^https:/)
    await expect(menu).toHaveCount(0)
    await expect(preview).toHaveCount(0)
    const focus = (triggerId: string | null) =>
      page.evaluate(
        (triggerId) => ({
          tag: document.activeElement?.tagName,
          role: document.activeElement?.getAttribute('role'),
          inPreview: Boolean(document.activeElement?.closest('[data-activity-preview-owner]')),
          originalTriggerConnected: Boolean(
            triggerId && document.getElementById(triggerId)?.isConnected
          )
        }),
        triggerId
      )
    const originalFocus = await focus(triggerId)
    await row.screenshot({ path: testInfo.outputPath(`${surface}-issue-copy-original-closed.png`) })
    await openPreview('cli')
    expect(
      await call(
        ['activity', 'preview-issue-menu', '--pane', paneKey, '--enabled', 'true'],
        surface
      )
    ).toMatchObject({ applied: true })
    const cliTriggerId = await trigger.getAttribute('id')
    const cliMenuId = await trigger.getAttribute('aria-controls')
    const cliMenu = page.locator(`[role="menu"][id="${cliMenuId}"]`)
    await expect(cliMenu).toBeVisible()
    await cliMenu.screenshot({ path: testInfo.outputPath(`${surface}-issue-copy-cli-menu.png`) })
    await page.evaluate(() => window.api.ui.writeClipboardText('fixture-before-cli-issue-copy'))
    const cliToasts = await captureToasts()
    const result = await call(['activity', 'preview-copy-issue-link', '--pane', paneKey], surface)
    await expectNewCopyToast(cliToasts)
    expect(result).toMatchObject({
      applied: true,
      persisted: null,
      writeOutcome: 'not_requested',
      copyAction: { paneKey, kind: 'issue-link', writeAcknowledged: true, verified: true }
    })
    expect(JSON.stringify(result)).not.toContain(original)
    expect(await page.evaluate(() => window.api.ui.readClipboardText())).toBe(original)
    await expect(cliMenu).toHaveCount(0)
    await expect(preview).toHaveCount(0)
    const cliFocus = await focus(cliTriggerId)
    expect(cliFocus).toEqual(originalFocus)
    await row.screenshot({ path: testInfo.outputPath(`${surface}-issue-copy-cli-closed.png`) })
    writeFileSync(
      testInfo.outputPath(`${surface}-issue-copy-focus.json`),
      JSON.stringify({ originalFocus, cliFocus }, null, 2)
    )
  }
}
