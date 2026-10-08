import { writeFileSync } from 'node:fs'
import { expect, type Page, type TestInfo } from '@playwright/test'
import type { ActivityViewerResult } from '../../../src/shared/activity-viewer-command'

export async function assertActivityIssueMenu(
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
    expect(
      await call(['activity', 'preview', '--pane', paneKey, '--enabled', 'true'], surface)
    ).toMatchObject({ applied: true })
    const row = page
      .locator(`[data-activity-viewer="${surface}"] [data-activity-viewer-thread]`)
      .filter({ hasText: 'Activity task a' })
      .getByRole('listitem')
    const owner = await row.getAttribute('data-activity-preview-trigger')
    const preview = page.locator(`[data-activity-preview-owner="${owner}"]`)
    const trigger = preview.locator('button[aria-haspopup="menu"]')
    await expect(trigger).toHaveCount(1)
    const triggerId = await trigger.getAttribute('id')
    await trigger.press('Enter')
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const menuId = await trigger.getAttribute('aria-controls')
    const menu = page.locator(`[role="menu"][id="${menuId}"]`)
    await expect(menu).toBeVisible()
    await expect(menu).toHaveAttribute('aria-labelledby', triggerId ?? '')
    const originalItems = await menu.getByRole('menuitem').allTextContents()
    await menu.screenshot({ path: testInfo.outputPath(`${surface}-issue-menu-original.png`) })
    await trigger.press('Enter')
    await expect(menu).toHaveCount(0)
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    const setMenu = (enabled: boolean) =>
      call(
        ['activity', 'preview-issue-menu', '--pane', paneKey, '--enabled', String(enabled)],
        surface
      )
    expect(await setMenu(false)).toMatchObject({
      applied: true,
      issueMenuAction: { enabled: false, visible: false }
    })
    expect(await setMenu(true)).toMatchObject({
      applied: true,
      persisted: null,
      writeOutcome: 'not_requested',
      issueMenuAction: { paneKey, enabled: true, visible: true }
    })
    await expect(trigger).toHaveAttribute('id', triggerId ?? '')
    await expect(menu).toBeVisible()
    expect(await menu.getByRole('menuitem').allTextContents()).toEqual(originalItems)
    await menu.screenshot({ path: testInfo.outputPath(`${surface}-issue-menu-cli.png`) })
    expect(await setMenu(true)).toMatchObject({
      applied: true,
      issueMenuAction: { enabled: true, visible: true }
    })
    await expect(menu).toBeVisible()
    if (surface === 'sidebar-agents') {
      expect(
        await call(['activity', 'preview', '--pane', paneKey, '--enabled', 'false'], surface)
      ).toMatchObject({ applied: false, previewAction: { enabled: false, visible: true } })
      await expect(menu).toBeVisible()
    }
    const originalMenuNode = await menu.elementHandle()
    const timeline = originalMenuNode?.evaluate(
      (node, identity) =>
        new Promise<unknown[]>((resolve) => {
          const started = performance.now()
          const originalPreview = document.querySelector(
            `[data-activity-preview-owner="${identity.owner}"]`
          )
          const snapshots: unknown[] = []
          let previous = ''
          const describe = (element: Element | null) => {
            if (!element) {
              return null
            }
            const rect = element.getBoundingClientRect()
            const style = getComputedStyle(element)
            return {
              connected: element.isConnected,
              attributes: Object.fromEntries(
                [...element.attributes].map((attribute) => [attribute.name, attribute.value])
              ),
              display: style.display,
              visibility: style.visibility,
              bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
            }
          }
          const capture = () => {
            const current = document.getElementById(identity.triggerId ?? '')
            const sameMenuId = document.getElementById(node.id)
            const snapshot = {
              originalMenu: describe(node),
              sameMenuId: describe(sameMenuId),
              sameMenuIsOriginal: sameMenuId === node,
              trigger: describe(current),
              originalPreview: describe(originalPreview),
              currentPreviews: [...document.querySelectorAll('[data-activity-preview-owner]')]
                .filter(
                  (element) =>
                    element.getAttribute('data-activity-preview-owner') === identity.owner
                )
                .map(describe),
              outer: describe(
                document.querySelector(`[data-activity-preview-trigger="${identity.owner}"]`)
              )
            }
            const serialized = JSON.stringify(snapshot)
            if (serialized !== previous) {
              snapshots.push({ elapsedMs: performance.now() - started, ...snapshot })
              previous = serialized
            }
          }
          const observer = new MutationObserver(capture)
          observer.observe(document.body, { subtree: true, childList: true, attributes: true })
          const timer = setInterval(capture, 50)
          capture()
          setTimeout(() => {
            capture()
            observer.disconnect()
            clearInterval(timer)
            resolve(snapshots)
          }, 6500)
        }),
      { owner, triggerId }
    )
    await page.evaluate(() => undefined)
    const closed = await setMenu(false)
    if (timeline) {
      const observed = await timeline
      writeFileSync(
        testInfo.outputPath(`${surface}-issue-menu-close-timeline.json`),
        JSON.stringify({ closed, observed }, null, 2)
      )
    }
    await originalMenuNode?.dispose()
    expect(closed).toMatchObject({
      applied: true,
      issueMenuAction: { enabled: false, visible: false }
    })
    await expect(menu).toHaveCount(0)
    if (surface === 'sidebar-agents') {
      await expect(preview).toHaveCount(0)
    } else {
      expect(
        await call(['activity', 'preview', '--pane', paneKey, '--enabled', 'false'], surface)
      ).toMatchObject({ applied: true })
    }
  }
}
