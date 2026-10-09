import type { ElectronApplication, Page } from '@stablyai/playwright-test'
import {
  listCliTerminals,
  patchWorkspaceSession,
  readFlushedWorkspaceSession,
  runCompiledCliJson,
  type PersistedTerminalLayout
} from './helpers/compiled-cli'
import { expect, test } from './helpers/orca-app'
import {
  ensureTerminalVisible,
  getActiveTabId,
  waitForActiveWorktree,
  waitForSessionReady
} from './helpers/store'
import { SORTABLE_TAB } from './helpers/terminal-tab-menu'

// Why: menu and dialog labels are asserted in English; the host locale would localize them.
test.use({ orcaAppExtraArgs: ['--lang=en-US'] })

async function openSplitTerminalTab(page: Page, electronApp: ElectronApplication) {
  await waitForSessionReady(page)
  await waitForActiveWorktree(page)
  await ensureTerminalVisible(page)
  await expect(page.locator(SORTABLE_TAB)).toHaveCount(1)
  const tabId = await getActiveTabId(page)
  if (!tabId) {
    throw new Error('terminal tab was not active')
  }
  const userDataDir = await electronApp.evaluate(({ app }) => app.getPath('userData'))
  const original = listCliTerminals(userDataDir).find((terminal) => terminal.tabId === tabId)
  if (!original) {
    throw new Error('active tab has no CLI terminal')
  }
  runCompiledCliJson(userDataDir, [
    'terminal',
    'split',
    '--terminal',
    original.handle,
    '--direction',
    'horizontal'
  ])
  await expect
    .poll(() => listCliTerminals(userDataDir).filter((t) => t.tabId === tabId).length)
    .toBe(2)
  return { tabId, userDataDir }
}

function viewerLayout(page: Page, tabId: string): Promise<PersistedTerminalLayout | undefined> {
  return page.evaluate((id) => window.__store?.getState().terminalLayoutsByTabId?.[id], tabId)
}

async function chooseTerminalMenuItem(page: Page, name: RegExp): Promise<void> {
  await page.locator('.xterm:visible').first().click({ button: 'right' })
  await page.getByRole('menuitem', { name }).click()
}

async function setPaneTitle(page: Page, title: string): Promise<void> {
  await chooseTerminalMenuItem(page, /Set Title/i)
  const input = page.getByRole('textbox', { name: /Pane title/i })
  await input.fill(title)
  await input.press('Enter')
}

test.describe('viewer-owned pane layout: persistence and the CLI write path', () => {
  test('context-menu expand, collapse, set title and clear title persist into the workspace session', async ({
    orcaPage,
    electronApp
  }) => {
    const { tabId, userDataDir } = await openSplitTerminalTab(orcaPage, electronApp)
    const persisted = () => readFlushedWorkspaceSession(userDataDir).terminalLayoutsByTabId[tabId]

    await chooseTerminalMenuItem(orcaPage, /Expand Pane/i)
    await expect
      .poll(async () => (await viewerLayout(orcaPage, tabId))?.expandedLeafId)
      .toBeTruthy()
    const leafId = (await viewerLayout(orcaPage, tabId))?.expandedLeafId
    expect(persisted()?.expandedLeafId).toBe(leafId)

    await chooseTerminalMenuItem(orcaPage, /Collapse Pane/i)
    await expect.poll(async () => (await viewerLayout(orcaPage, tabId))?.expandedLeafId).toBeNull()
    expect(persisted()?.expandedLeafId).toBeNull()

    await setPaneTitle(orcaPage, 'Layout Title')
    await expect
      .poll(async () => Object.values((await viewerLayout(orcaPage, tabId))?.titlesByLeafId ?? {}))
      .toContain('Layout Title')
    expect(Object.values(persisted()?.titlesByLeafId ?? {})).toContain('Layout Title')

    await chooseTerminalMenuItem(orcaPage, /Clear Pane Title/i)
    await expect
      .poll(async () => Object.values((await viewerLayout(orcaPage, tabId))?.titlesByLeafId ?? {}))
      .not.toContain('Layout Title')
    expect(Object.values(persisted()?.titlesByLeafId ?? {})).not.toContain('Layout Title')
  })

  test('patch-session writes a live desktop session, but the viewer restores its own layout on its next write', async ({
    orcaPage,
    electronApp
  }) => {
    const { tabId, userDataDir } = await openSplitTerminalTab(orcaPage, electronApp)
    await chooseTerminalMenuItem(orcaPage, /Expand Pane/i)
    await expect
      .poll(async () => (await viewerLayout(orcaPage, tabId))?.expandedLeafId)
      .toBeTruthy()
    const expandedLeaf = (await viewerLayout(orcaPage, tabId))?.expandedLeafId

    const session = readFlushedWorkspaceSession(userDataDir)
    expect(
      patchWorkspaceSession(userDataDir, {
        terminalLayoutsByTabId: {
          ...session.terminalLayoutsByTabId,
          [tabId]: { ...session.terminalLayoutsByTabId[tabId], expandedLeafId: null }
        }
      })
    ).toEqual({ applied: true, durable: true, normalized: false })
    expect(
      readFlushedWorkspaceSession(userDataDir).terminalLayoutsByTabId[tabId]?.expandedLeafId
    ).toBeNull()
    expect((await viewerLayout(orcaPage, tabId))?.expandedLeafId).toBe(expandedLeaf)

    await setPaneTitle(orcaPage, 'Viewer Write')
    await expect
      .poll(
        () => readFlushedWorkspaceSession(userDataDir).terminalLayoutsByTabId[tabId]?.expandedLeafId
      )
      .toBe(expandedLeaf)
  })
})
