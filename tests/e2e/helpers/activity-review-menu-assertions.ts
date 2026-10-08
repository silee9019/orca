import { writeFileSync } from 'node:fs'
import { expect, type Page, type TestInfo } from '@playwright/test'
import type { ActivityViewerResult } from '../../../src/shared/activity-viewer-command'

export async function assertActivityReviewMenu(
  page: Page,
  call: (args: string[], surface?: string) => Promise<ActivityViewerResult>,
  testInfo: TestInfo
): Promise<void> {
  const paneKey = 'activity-tab-a:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  for (const [provider, withUrl] of [
    ['github', true],
    ['gitlab', true],
    ['github', false]
  ] as const) {
    const label = provider === 'gitlab' ? 'MR' : 'PR'
    const variant = `${provider}-${withUrl ? 'linked' : 'unlink-only'}`
    await page.evaluate(
      ({ provider, withUrl }) => {
        const store = window.__store
        if (!store) {
          throw new Error('store unavailable')
        }
        const data = {
          provider,
          number: 11,
          title: 'Fixture review',
          state: 'open',
          url: withUrl ? 'https://example.com/reviews/11' : '',
          status: 'neutral',
          updatedAt: '2026-01-01T00:00:00Z',
          mergeable: 'UNKNOWN'
        } as const
        store.setState({
          fetchHostedReviewForBranch: async () => {},
          hostedReviewCache: {
            ...store.getState().hostedReviewCache,
            'local::activity-repo-a::activity-0': { data, fetchedAt: Date.now() }
          },
          worktreesByRepo: Object.fromEntries(
            Object.entries(store.getState().worktreesByRepo).map(([repoId, items]) => [
              repoId,
              items.map((item) =>
                item.id === 'activity-wt-0'
                  ? {
                      ...item,
                      linkedPR: provider === 'github' ? 11 : null,
                      linkedGitLabMR: provider === 'gitlab' ? 11 : null
                    }
                  : item
              )
            ])
          )
        })
      },
      { provider, withUrl }
    )
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
      const trigger = preview.locator(`button[aria-haspopup="menu"][aria-label*="${label}"]`)
      const openPreview = async () => {
        expect(
          await call(['activity', 'preview', '--pane', paneKey, '--enabled', 'true'], surface)
        ).toMatchObject({ applied: true })
        await expect(trigger).toHaveCount(1)
        await trigger.scrollIntoViewIfNeeded()
        await expect(trigger).toBeVisible()
      }
      await openPreview()
      await trigger.press('Enter')
      const originalMenuId = await trigger.getAttribute('aria-controls')
      const originalMenu = page.locator(`[role="menu"][id="${originalMenuId}"]`)
      await expect(originalMenu).toBeVisible()
      const originalItems = await originalMenu.getByRole('menuitem').allTextContents()
      if (!withUrl) {
        expect(originalItems).toHaveLength(1)
      }
      await originalMenu.screenshot({
        path: testInfo.outputPath(`${surface}-${variant}-review-menu-original.png`)
      })
      await trigger.press('Enter')
      await expect(originalMenu).toHaveCount(0)
      await openPreview()
      const setMenu = (enabled: boolean) =>
        call(
          ['activity', 'preview-review-menu', '--pane', paneKey, '--enabled', String(enabled)],
          surface
        )
      expect(await setMenu(false)).toMatchObject({
        applied: true,
        reviewMenuAction: { enabled: false, visible: false }
      })
      if (withUrl) {
        const issue = preview.locator(`button[aria-haspopup="menu"]:not([aria-label*="${label}"])`)
        await expect(issue).toHaveCount(1)
        await issue.scrollIntoViewIfNeeded()
        expect(
          await call(
            ['activity', 'preview-issue-menu', '--pane', paneKey, '--enabled', 'true'],
            surface
          )
        ).toMatchObject({ applied: true })
        const issueMenuId = await issue.getAttribute('aria-controls')
        await trigger.scrollIntoViewIfNeeded()
        expect(await setMenu(true)).toMatchObject({
          applied: true,
          reviewMenuAction: { enabled: true, visible: true }
        })
        await expect(page.locator(`[role="menu"][id="${issueMenuId}"]`)).toHaveCount(0)
      } else {
        expect(await setMenu(true)).toMatchObject({
          applied: true,
          reviewMenuAction: { enabled: true, visible: true }
        })
      }
      const triggerId = await trigger.getAttribute('id')
      const menuId = await trigger.getAttribute('aria-controls')
      const menu = page.locator(`[role="menu"][id="${menuId}"]`)
      await expect(menu).toBeVisible()
      await expect(menu).toHaveAttribute('aria-labelledby', triggerId ?? '')
      expect(await menu.getByRole('menuitem').allTextContents()).toEqual(originalItems)
      await menu.screenshot({
        path: testInfo.outputPath(`${surface}-${variant}-review-menu-cli.png`)
      })
      expect(await setMenu(true)).toMatchObject({
        applied: true,
        reviewMenuAction: { enabled: true, visible: true }
      })
      const closed = await setMenu(false)
      expect(closed).toMatchObject({
        applied: true,
        persisted: null,
        writeOutcome: 'not_requested',
        reviewMenuAction: { paneKey, enabled: false, visible: false }
      })
      await expect(menu).toHaveCount(0)
      writeFileSync(
        testInfo.outputPath(`${surface}-${variant}-review-menu.json`),
        JSON.stringify({ provider, withUrl, originalItems, closed }, null, 2)
      )
      expect(
        await call(['activity', 'preview', '--pane', paneKey, '--enabled', 'false'], surface)
      ).toMatchObject({ applied: true })
    }
  }
}
