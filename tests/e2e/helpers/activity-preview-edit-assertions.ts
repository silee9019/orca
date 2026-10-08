import { expect, type ElectronApplication, type Page, type TestInfo } from '@playwright/test'
import type { ActivityViewerResult } from '../../../src/shared/activity-viewer-command'

export async function assertActivityPreviewEdit(
  electronApp: ElectronApplication,
  page: Page,
  call: (args: string[], surface?: string) => Promise<ActivityViewerResult>,
  testInfo: TestInfo
): Promise<void> {
  await electronApp.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('gh:issue')
    ipcMain.handle('gh:issue', (_event, args: { number: number }) =>
      args.number === 7
        ? {
            number: 7,
            title: 'Fixture issue',
            url: 'https://example.com/issues/7',
            state: 'OPEN',
            labels: [],
            description: 'Fixture issue body'
          }
        : null
    )
  })
  await page.evaluate(() => {
    const store = window.__store
    if (!store) {
      throw new Error('store unavailable')
    }
    store.setState({
      worktreesByRepo: Object.fromEntries(
        Object.entries(store.getState().worktreesByRepo).map(([repoId, items]) => [
          repoId,
          items.map((item) =>
            item.id === 'activity-wt-0'
              ? { ...item, linkedIssue: 7, comment: 'Fixture original notes' }
              : item
          )
        ])
      )
    })
  })
  const paneKey = 'activity-tab-a:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  for (const surface of ['activity-page', 'sidebar-agents']) {
    await page.evaluate((surface) => {
      const state = window.__store?.getState()
      state?.setActiveView(surface === 'activity-page' ? 'activity' : 'terminal')
      state?.setSidebarOpen(surface === 'sidebar-agents')
      state?.setSidebarBody('agents')
    }, surface)
    const row = page
      .locator(`[data-activity-viewer="${surface}"]`)
      .locator('[data-activity-viewer-thread]')
      .filter({ hasText: 'Activity task a' })
      .getByRole('listitem')
    await expect(row).toBeVisible()
    const owner = await row.getAttribute('data-activity-preview-trigger')
    const portal = page.locator(`[data-activity-preview-owner="${owner}"]`)
    const logical = (await call(['activity', 'get'], surface)).rendered?.logicalRows.find(
      (item) => item.key === `t:${paneKey}`
    )
    expect(logical).toBeDefined()
    for (const field of ['issue', 'comment']) {
      expect(
        await call(['activity', 'preview', '--pane', paneKey, '--enabled', 'true'], surface)
      ).toMatchObject({ applied: true })
      const edit = portal.locator('button').filter({ has: page.locator('svg.lucide-pencil') })
      await expect(edit).toHaveCount(2)
      const button = edit.nth(field === 'issue' ? 0 : 1)
      await button.click()
      const dialog = page.locator('[role="dialog"][data-worktree-meta-workspace]')
      await expect(dialog).toBeVisible()
      await expect(dialog).toHaveAttribute(
        'data-worktree-meta-workspace',
        logical?.workspaceId ?? ''
      )
      await expect(dialog).toHaveAttribute('data-worktree-meta-host', logical?.hostId ?? '')
      await expect(dialog).toHaveAttribute('data-worktree-meta-focus', field)
      await expect(dialog).toHaveAttribute('data-worktree-meta-seed-ready', 'true')
      const originalOwner = await dialog.getAttribute('data-worktree-meta-repo')
      const original = await dialog
        .locator('input,textarea')
        .evaluateAll((nodes) =>
          nodes.map((node) =>
            node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement
              ? node.value
              : ''
          )
        )
      const originalFocus = await dialog.locator('input,textarea').evaluateAll((nodes) => {
        const active = document.activeElement
        return active instanceof HTMLElement ? nodes.indexOf(active) : -1
      })
      expect(originalFocus).toBe(field === 'issue' ? 1 : 3)
      expect(original[1]).toBe('7')
      expect(original[3]).toBe('Fixture original notes')
      await dialog.screenshot({
        path: testInfo.outputPath(`${surface}-${field}-editor-original.png`)
      })
      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
      expect(
        await call(['activity', 'preview', '--pane', paneKey, '--enabled', 'true'], surface)
      ).toMatchObject({ applied: true })
      await button.scrollIntoViewIfNeeded()
      expect(
        await call(['activity', 'preview-edit', '--pane', paneKey, '--field', field], surface)
      ).toMatchObject({
        applied: true,
        persisted: null,
        writeOutcome: 'not_requested',
        editAction: { paneKey, field, opened: true, focus: 'focused' }
      })
      await expect(dialog).toBeVisible()
      await expect(dialog).toHaveAttribute(
        'data-worktree-meta-workspace',
        logical?.workspaceId ?? ''
      )
      await expect(dialog).toHaveAttribute('data-worktree-meta-host', logical?.hostId ?? '')
      await expect(dialog).toHaveAttribute('data-worktree-meta-repo', originalOwner ?? '')
      expect(
        await dialog
          .locator('input,textarea')
          .evaluateAll((nodes) =>
            nodes.map((node) =>
              node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement
                ? node.value
                : ''
            )
          )
      ).toEqual(original)
      expect(
        await dialog.locator('input,textarea').evaluateAll((nodes) => {
          const active = document.activeElement
          return active instanceof HTMLElement ? nodes.indexOf(active) : -1
        })
      ).toBe(originalFocus)
      await dialog.screenshot({ path: testInfo.outputPath(`${surface}-${field}-editor-cli.png`) })
      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
      expect(
        await call(['activity', 'preview', '--pane', paneKey, '--enabled', 'false'], surface)
      ).toMatchObject({ applied: true })
    }
  }
}
