import { expect, type Page, type TestInfo } from '@playwright/test'
import type { ActivityViewerResult } from '../../../src/shared/activity-viewer-command'

export async function assertActivityPageClose(
  page: Page,
  call: (args: string[], surface?: string) => Promise<ActivityViewerResult>,
  testInfo: TestInfo
): Promise<void> {
  for (const previous of ['terminal', 'settings'] as const) {
    await page.evaluate((previous) => {
      const state = window.__store?.getState()
      state?.setActiveView(previous)
      state?.openActivityPage()
      state?.openActivityPage()
    }, previous)
    await expect(page.locator('[data-activity-page-close]')).toBeVisible()
    await expect(page.locator('[data-activity-viewer="activity-page"]')).toBeVisible()
    expect(await call(['activity', 'close'])).toMatchObject({
      applied: true,
      dispatched: true,
      persisted: null,
      writeOutcome: 'not_requested',
      pageAction: { requestedView: previous, reachedView: previous }
    })
    await expect(page.locator('[data-activity-viewer="activity-page"]')).toHaveCount(0)
    const destination = page.locator(`[data-rendered-active-page="${previous}"]`)
    await expect(destination).toBeVisible()
    await expect(
      previous === 'terminal'
        ? page.locator(
            '[data-rendered-active-worktree-id="activity-wt-0"][data-rendered-active-execution-host-id="local"]'
          )
        : page.locator('.settings-view-shell')
    ).toBeVisible()
    await destination.screenshot({ path: testInfo.outputPath(`activity-close-${previous}.png`) })
  }
}
