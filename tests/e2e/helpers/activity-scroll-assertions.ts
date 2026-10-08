import { expect, type Page, type Locator, type TestInfo } from '@playwright/test'
import type { ActivityViewerResult } from '../../../src/shared/activity-viewer-command'
import type { SidebarViewerResult } from '../../../src/shared/sidebar-viewer-command'

const readViewport = (list: Locator) =>
  list.evaluate((root) => {
    const scroll = root.querySelector('[data-activity-virtual-list]')?.parentElement
    if (!scroll) {
      throw new Error('scroll_fixture_missing')
    }
    const viewport = scroll.getBoundingClientRect()
    const keys = [...root.querySelectorAll<HTMLElement>('[data-activity-viewer-thread]')].flatMap(
      (row) => {
        const rect = row.getBoundingClientRect()
        return rect.bottom > viewport.top &&
          rect.top < viewport.bottom &&
          row.dataset.activityViewerThread
          ? [row.dataset.activityViewerThread]
          : []
      }
    )
    return { top: scroll.scrollTop, height: scroll.clientHeight, total: scroll.scrollHeight, keys }
  })
export async function assertActivityScroll(
  page: Page,
  call: (args: string[], surface?: string) => Promise<ActivityViewerResult>,
  toggleSidebar: () => Promise<SidebarViewerResult>,
  testInfo: TestInfo
): Promise<void> {
  await page.evaluate(() => {
    const store = window.__store
    const state = store?.getState()
    const template = Object.values(state?.retainedAgentsByPaneKey ?? {})[0]
    if (!store || !state || !template) {
      throw new Error('scroll_retained_fixture_missing')
    }
    const retained = { ...state.retainedAgentsByPaneKey }
    const now = Date.now()
    for (let index = 0; index < 80; index += 1) {
      const id = String(index).padStart(3, '0')
      const tab = {
        ...template.tab,
        id: `scroll-tab-${id}`,
        title: `Viewport task ${id}`,
        ptyId: null,
        createdAt: now + index
      }
      const paneKey = `${tab.id}:dddddddd-dddd-4ddd-8ddd-${String(index).padStart(12, '0')}`
      retained[paneKey] = {
        ...template,
        tab,
        startedAt: now + index,
        entry: {
          ...template.entry,
          paneKey,
          state: 'done',
          prompt: `Viewport task ${id}`,
          terminalTitle: tab.title,
          updatedAt: now + index,
          stateStartedAt: now + index
        }
      }
    }
    store.setState({
      retainedAgentsByPaneKey: retained,
      activityClearedAtByPaneKey: {},
      agentsGroupBy: 'none',
      agentsReadFilter: 'all',
      agentsShowChildAgents: true,
      agentsVisibleHostIds: ['local'],
      agentsFilterRepoIds: []
    })
  })
  for (const surface of ['activity-page', 'sidebar-agents']) {
    await page.evaluate((surface) => {
      const state = window.__store?.getState()
      state?.setActiveView(surface === 'activity-page' ? 'activity' : 'terminal')
      state?.setSidebarOpen(surface === 'sidebar-agents')
      state?.setSidebarBody('agents')
    }, surface)
    const list = page.locator(`[data-activity-viewer="${surface}"]`)
    await expect(list).toBeVisible()
    const initial = await call(['activity', 'get'], surface)
    expect(initial.rendered?.logicalRows.length).toBeGreaterThanOrEqual(80)
    await expect
      .poll(async () => {
        const view = await readViewport(list)
        return view.total - view.height
      })
      .toBeGreaterThan(1800)
    const before = await readViewport(list)
    const result = await call(['activity', 'scroll', '--top', '900'], surface)
    expect(result).toMatchObject({
      applied: true,
      persisted: null,
      writeOutcome: 'not_requested',
      scrollAction: { requestedTop: 900, targetTop: 900, scrollTop: 900 }
    })
    expect(result.scrollAction?.visibleRowKeys.length).toBeGreaterThan(0)
    expect(result.rendered?.logicalRows).toEqual(initial.rendered?.logicalRows)
    await expect.poll(async () => (await readViewport(list)).top).toBe(900)
    const after = await readViewport(list)
    expect(after.keys).not.toEqual(before.keys)
    expect(result.scrollAction?.visibleRowKeys.every((key) => after.keys.includes(key))).toBe(true)
    await list.screenshot({ path: testInfo.outputPath(`${surface}-scrolled.png`) })
    if (surface === 'sidebar-agents') {
      expect(await toggleSidebar()).toMatchObject({ applied: true, sidebarOpen: false })
      await expect(list).toHaveCount(0)
      expect(await toggleSidebar()).toMatchObject({ applied: true, sidebarOpen: true })
      await expect(list).toBeVisible()
      await expect.poll(async () => (await readViewport(list)).top).toBe(900)
      expect((await readViewport(list)).keys).toEqual(after.keys)
      await list.screenshot({ path: testInfo.outputPath('sidebar-scroll-restored.png') })
    }
  }
}
