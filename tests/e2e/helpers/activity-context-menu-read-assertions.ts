import { writeFileSync } from 'node:fs'
import { expect, type Page, type TestInfo } from '@playwright/test'
import type { ActivityViewerResult } from '../../../src/shared/activity-viewer-command'

export async function assertActivityContextMenuRead(
  page: Page,
  call: (args: string[], surface?: string) => Promise<ActivityViewerResult>,
  testInfo: TestInfo
): Promise<void> {
  const a = 'activity-tab-a:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  const b = 'activity-tab-b:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
  for (const surface of ['activity-page', 'sidebar-agents']) {
    await page.evaluate((surface) => {
      const state = window.__store?.getState()
      state?.setActiveView('terminal')
      state?.setSidebarOpen(surface === 'sidebar-agents')
      state?.setSidebarBody('agents')
    }, surface)
    if (surface === 'activity-page') {
      await page.evaluate(() => window.__store?.getState().setActiveView('activity'))
    }
    const root = page.locator(`[data-activity-viewer="${surface}"]`)
    const source = root
      .locator('[data-activity-context-trigger]')
      .filter({ hasText: 'Activity task a' })
    const second = root
      .locator('[data-activity-context-trigger]')
      .filter({ hasText: 'Activity task b' })
    const run = (args: string[]) => call(['activity', ...args], surface)
    await run(['read', '--filter', 'all'])
    await run(['search', '--query', ''])
    await run(['group', '--by', 'none'])
    const unreadTargets = async () => {
      await run(['read', '--filter', 'unread'])
      const result = {
        a: (await root.getByRole('listitem').filter({ hasText: 'Activity task a' }).count()) === 1,
        b: (await root.getByRole('listitem').filter({ hasText: 'Activity task b' }).count()) === 1
      }
      const selectedPaneKey = (await run(['get'])).rendered?.selectedPaneKey
      if (selectedPaneKey === a) {
        // Unread-only retains the selected read row; inspect its original toggle instead of row presence.
        await page.mouse.click(1, 1)
        await source.click({ button: 'right', position: { x: 30, y: 20 } })
        const owner = await source.getAttribute('data-activity-context-trigger')
        const menu = page.locator(`[data-activity-context-owner="${owner}"]`)
        const item = menu.locator('[data-activity-context-action="read-toggle"]')
        await expect(menu).toHaveAttribute('data-activity-context-targets', JSON.stringify([a]))
        result.a = (await item.getAttribute('data-activity-context-read-operation')) === 'read'
        await menu.press('Escape')
        await expect(menu).toHaveCount(0)
      }
      await expect(root.getByRole('listitem')).toHaveCount(
        Number(result.a) + Number(result.b) + Number(selectedPaneKey === a && !result.a)
      )
      await run(['read', '--filter', 'all'])
      return result
    }
    for (const bulk of [false, true]) {
      for (const operation of ['read', 'unread']) {
        const prepare = async () => {
          await run(['mark-all-read'])
          if (operation === 'read') {
            await page.evaluate(
              (paneKey) => window.__store?.getState().unacknowledgeAgents([paneKey]),
              a
            )
          }
          await source.scrollIntoViewIfNeeded()
          await page.mouse.click(1, 1)
          if (bulk) {
            const modifier = await page.evaluate(() =>
              navigator.userAgent.includes('Mac') ? 'Meta' : 'Control'
            )
            await source.getByRole('listitem').click({ modifiers: [modifier] })
            await second.getByRole('listitem').click({ modifiers: [modifier] })
          }
        }
        await prepare()
        const owner = await source.getAttribute('data-activity-context-trigger')
        const menu = page.locator(`[data-activity-context-owner="${owner}"]`)
        await source.click({ button: 'right', position: { x: 30, y: 20 } })
        await expect(menu).toBeVisible()
        const snapshot = JSON.parse(
          (await menu.getAttribute('data-activity-context-targets')) ?? 'null'
        )
        expect([...snapshot].sort()).toEqual((bulk ? [a, b] : [a]).sort())
        const item = menu.locator('[data-activity-context-action="read-toggle"]')
        await expect(item).toHaveAttribute('data-activity-context-read-operation', operation)
        await expect(item).not.toHaveAttribute('data-disabled', '')
        await menu.screenshot({
          path: testInfo.outputPath(`${surface}-menu-${bulk ? 'bulk' : 'single'}-${operation}.png`)
        })
        await item.click()
        await expect(menu).toHaveCount(0)
        const focusOnRow = await source
          .getByRole('listitem')
          .evaluate((node) => node.contains(document.activeElement))
        expect(focusOnRow).toBe(false)
        const original = await unreadTargets()
        expect(original).toEqual({ a: operation === 'unread', b: bulk && operation === 'unread' })
        await prepare()
        const reply = await run(
          bulk
            ? ['read-toggle-many', '--panes', JSON.stringify(snapshot)]
            : ['read-toggle', '--pane', a]
        )
        expect(reply).toMatchObject({
          applied: true,
          readAction: { operation, paneKeys: operation === 'read' ? [a] : snapshot },
          readStates: (operation === 'read' ? [a] : snapshot).map((paneKey: string) => ({
            paneKey,
            unread: operation === 'unread'
          }))
        })
        await expect(menu).toHaveCount(0)
        const direct = await unreadTargets()
        expect(direct).toEqual(original)
        writeFileSync(
          testInfo.outputPath(`${surface}-menu-${bulk ? 'bulk' : 'single'}-${operation}.json`),
          JSON.stringify({ snapshot, operation, original, direct, focusOnRow, reply }, null, 2)
        )
      }
    }
    await run(['mark-all-read'])
    if (surface === 'activity-page') {
      await page.mouse.click(1, 1)
      const selected = await source.getByRole('listitem').evaluate((node) => {
        const store = window.__store
        if (!store || !(node instanceof HTMLElement)) {
          throw new Error('activity_protected_fixture_missing')
        }
        const resolver = store.getState().getKnownWorktreeById
        // Exercise original local selection with an unavailable workspace; avoid navigation or reseeding.
        store.setState({ getKnownWorktreeById: () => undefined })
        try {
          node.click()
        } finally {
          store.setState({ getKnownWorktreeById: resolver })
        }
        return {
          activeView: store.getState().activeView,
          resolverRestored: store.getState().getKnownWorktreeById === resolver
        }
      })
      expect(selected).toEqual({ activeView: 'activity', resolverRestored: true })
      await source.click({ button: 'right', position: { x: 30, y: 20 } })
      const owner = await source.getAttribute('data-activity-context-trigger')
      const menu = page.locator(`[data-activity-context-owner="${owner}"]`)
      const item = menu.locator('[data-activity-context-action="read-toggle"]')
      await expect(item).toHaveAttribute('data-disabled', '')
      await item.click({ force: true })
      await expect(menu).toBeVisible()
      await menu.screenshot({
        path: testInfo.outputPath('activity-page-menu-protected-single.png')
      })
      await menu.press('Escape')
      await expect(menu).toHaveCount(0)
      const original = await unreadTargets()
      expect(original).toEqual({ a: false, b: false })
      const reply = await run(['read-toggle', '--pane', a])
      expect(reply).toMatchObject({
        applied: true,
        readAction: { operation: 'unread', paneKeys: [] },
        readStates: []
      })
      await expect(menu).toHaveCount(0)
      expect(await unreadTargets()).toEqual(original)
      const modifier = await page.evaluate(() =>
        navigator.userAgent.includes('Mac') ? 'Meta' : 'Control'
      )
      const prepareBulk = async () => {
        await run(['mark-all-read'])
        await page.mouse.click(1, 1)
        await source.getByRole('listitem').click({ modifiers: [modifier] })
        await second.getByRole('listitem').click({ modifiers: [modifier] })
      }
      await prepareBulk()
      await source.click({ button: 'right', position: { x: 30, y: 20 } })
      await expect(item).not.toHaveAttribute('data-disabled', '')
      const protectedTargets = JSON.parse(
        (await menu.getAttribute('data-activity-context-targets')) ?? 'null'
      )
      expect([...protectedTargets].sort()).toEqual([a, b].sort())
      await item.click()
      await expect(menu).toHaveCount(0)
      expect(await unreadTargets()).toEqual({ a: false, b: true })
      await prepareBulk()
      const bulkReply = await run(['read-toggle-many', '--panes', JSON.stringify(protectedTargets)])
      expect(bulkReply).toMatchObject({
        applied: true,
        readAction: { operation: 'unread', paneKeys: [b] },
        readStates: [{ paneKey: b, unread: true }]
      })
      expect(await unreadTargets()).toEqual({ a: false, b: true })
      writeFileSync(
        testInfo.outputPath('activity-page-menu-protected.json'),
        JSON.stringify({ original, reply, bulkReply }, null, 2)
      )
      await run(['mark-all-read'])
    }
  }
}
