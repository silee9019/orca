import type { ElectronApplication, Page } from '@stablyai/playwright-test'
import {
  listCliTerminals,
  readFlushedWorkspaceSession,
  runCompiledCliJson
} from './helpers/compiled-cli'
import { expect, test } from './helpers/orca-app'
import {
  ensureTerminalVisible,
  getActiveTabId,
  getActiveWorktreeId,
  getAllWorktreeIds,
  waitForActiveWorktree,
  waitForSessionReady
} from './helpers/store'
import { createTerminalTabFromMenu, SORTABLE_TAB } from './helpers/terminal-tab-menu'

// Why: the tab strip and menu labels are asserted in English; the host locale would localize them.
test.use({ orcaAppExtraArgs: ['--lang=en-US'] })

function userDataDirOf(electronApp: ElectronApplication): Promise<string> {
  return electronApp.evaluate(({ app }) => app.getPath('userData'))
}

function activeLeafOf(page: Page, tabId: string): Promise<string | null | undefined> {
  return page.evaluate(
    (id) => window.__store?.getState().terminalLayoutsByTabId?.[id]?.activeLeafId,
    tabId
  )
}

function switchTerminal(userDataDir: string, handle: string): void {
  runCompiledCliJson(userDataDir, ['terminal', 'switch', '--terminal', handle])
}

test.describe('viewer-owned activation: UI controls and CLI converge on one persisted state', () => {
  test('tab strip click, tab shortcuts and terminal switch persist the same active tab', async ({
    orcaPage,
    electronApp
  }) => {
    await waitForSessionReady(orcaPage)
    const worktreeId = await waitForActiveWorktree(orcaPage)
    await ensureTerminalVisible(orcaPage)
    await expect(orcaPage.locator(SORTABLE_TAB)).toHaveCount(1)
    const first = await getActiveTabId(orcaPage)
    const second = await createTerminalTabFromMenu(orcaPage)
    const userDataDir = await userDataDirOf(electronApp)
    const handleOf = (tabId: string | null) => {
      const row = listCliTerminals(userDataDir).find((terminal) => terminal.tabId === tabId)
      if (!row) {
        throw new Error(`no CLI terminal for tab ${tabId}`)
      }
      return row.handle
    }
    const expectActiveEverywhere = async (tabId: string | null) => {
      await expect.poll(() => getActiveTabId(orcaPage)).toBe(tabId)
      expect(readFlushedWorkspaceSession(userDataDir).activeTabIdByWorktree[worktreeId]).toBe(tabId)
    }

    await orcaPage.locator(SORTABLE_TAB).nth(0).click()
    await expectActiveEverywhere(first)

    await orcaPage.keyboard.press('Control+PageDown')
    await expectActiveEverywhere(second)
    await orcaPage.keyboard.press('Control+PageUp')
    await expectActiveEverywhere(first)

    switchTerminal(userDataDir, handleOf(second))
    await expectActiveEverywhere(second)
    switchTerminal(userDataDir, handleOf(first))
    await expectActiveEverywhere(first)
  })

  test('pane focus shortcut and terminal switch persist the same active pane', async ({
    orcaPage,
    electronApp
  }) => {
    await waitForSessionReady(orcaPage)
    await waitForActiveWorktree(orcaPage)
    await ensureTerminalVisible(orcaPage)
    await expect(orcaPage.locator(SORTABLE_TAB)).toHaveCount(1)
    const tabId = await getActiveTabId(orcaPage)
    if (!tabId) {
      throw new Error('terminal tab was not active')
    }
    const userDataDir = await userDataDirOf(electronApp)
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
    const panes = listCliTerminals(userDataDir).filter((terminal) => terminal.tabId === tabId)
    const expectActivePane = async (leafId: string) => {
      await expect.poll(() => activeLeafOf(orcaPage, tabId)).toBe(leafId)
      expect(
        readFlushedWorkspaceSession(userDataDir).terminalLayoutsByTabId[tabId]?.activeLeafId
      ).toBe(leafId)
    }

    const initialLeaf = await activeLeafOf(orcaPage, tabId)
    const other = panes.find((pane) => pane.leafId !== initialLeaf)
    const current = panes.find((pane) => pane.leafId === initialLeaf)
    if (!other || !current) {
      throw new Error('split did not expose two addressable panes')
    }

    await orcaPage.locator('.xterm:visible').first().click()
    await orcaPage.keyboard.press('ControlOrMeta+BracketRight')
    await expectActivePane(other.leafId)

    switchTerminal(userDataDir, current.handle)
    await expectActivePane(current.leafId)
    switchTerminal(userDataDir, other.handle)
    await expectActivePane(other.leafId)
    await orcaPage.keyboard.press('ControlOrMeta+BracketLeft')
    await expectActivePane(current.leafId)
  })

  test('sidebar worktree click and terminal switch persist the same active worktree', async ({
    orcaPage,
    electronApp
  }) => {
    await waitForSessionReady(orcaPage)
    const primary = await waitForActiveWorktree(orcaPage)
    await ensureTerminalVisible(orcaPage)
    const secondary = (await getAllWorktreeIds(orcaPage)).find((id) => id !== primary)
    if (!secondary) {
      throw new Error('seeded secondary worktree not found')
    }
    const userDataDir = await userDataDirOf(electronApp)
    const created = runCompiledCliJson<{ terminal: { handle: string } }>(userDataDir, [
      'terminal',
      'create',
      '--worktree',
      `id:${secondary}`
    ])
    const expectActiveWorktree = async (worktreeId: string) => {
      await expect.poll(() => getActiveWorktreeId(orcaPage)).toBe(worktreeId)
      expect(readFlushedWorkspaceSession(userDataDir).activeWorktreeId).toBe(worktreeId)
    }

    switchTerminal(userDataDir, created.terminal.handle)
    await expectActiveWorktree(secondary)

    await orcaPage.getByText('main', { exact: true }).first().click()
    await expectActiveWorktree(primary)

    const primaryTerminal = listCliTerminals(userDataDir).find((t) => t.worktreeId === primary)
    if (!primaryTerminal) {
      throw new Error('primary worktree has no CLI terminal')
    }
    switchTerminal(userDataDir, created.terminal.handle)
    await expectActiveWorktree(secondary)
    switchTerminal(userDataDir, primaryTerminal.handle)
    await expectActiveWorktree(primary)
  })
})
