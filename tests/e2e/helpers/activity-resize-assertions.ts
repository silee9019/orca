import { expect, type Page, type TestInfo } from '@playwright/test'
import type { ActivityViewerResult } from '../../../src/shared/activity-viewer-command'

export async function assertActivityResize(
  page: Page,
  call: (args: string[], surface?: string) => Promise<ActivityViewerResult>,
  testInfo: TestInfo
): Promise<void> {
  await page.evaluate(() => window.__store?.getState().openActivityPage())
  const list = page.locator('[data-activity-viewer="activity-page"]')
  const handle = list.locator('[data-activity-list-resize]')
  await expect(handle).toBeVisible()
  for (const [requested, target] of [
    [600, 600],
    [1, 320],
    [1000, 720],
    [480, 480]
  ]) {
    expect(await call(['activity', 'resize', '--width', String(requested)])).toMatchObject({
      applied: true,
      dispatched: true,
      persisted: null,
      writeOutcome: 'not_requested',
      resizeAction: { requestedWidth: requested, targetWidth: target, renderedWidth: target }
    })
    await expect
      .poll(() => list.evaluate((node) => node.getBoundingClientRect().width))
      .toBe(target)
    await expect(handle).not.toHaveAttribute('data-activity-list-resizing', 'true')
    await expect
      .poll(() =>
        page.locator('body').evaluate((node) => ({
          cursor: node.style.cursor,
          userSelect: node.style.userSelect
        }))
      )
      .toEqual({ cursor: '', userSelect: '' })
    await list.screenshot({ path: testInfo.outputPath(`activity-resize-${target}.png`) })
  }
}
