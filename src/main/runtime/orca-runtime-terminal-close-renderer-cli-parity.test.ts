import './orca-runtime-test-lifecycle.spec'
import { describe, expect, it } from 'vitest'
import {
  LEAF_ID,
  PTY_ID,
  SIBLING_LEAF_ID,
  TAB_ID,
  WORKTREE_ID,
  createHarness
} from './__fixtures__/orca-runtime-terminal-close-continuity-fixtures'

async function closeSplitPaneThroughCli() {
  const harness = createHarness({ publishMobileSurface: true, registerPtyBacked: true })
  harness.syncSplitFixtureGraph()
  harness.syncFixtureTabWithoutLeaf()
  harness.setVerifiedStopResult(true)
  const terminal = (await harness.runtime.listTerminals(`id:${WORKTREE_ID}`)).terminals.find(
    (candidate) => candidate.ptyId === PTY_ID
  )!
  await harness.runtime.closeTerminal(terminal.handle)
  return harness
}

async function closeSplitPaneThroughRendererReport() {
  const harness = createHarness({ publishMobileSurface: true, registerPtyBacked: true })
  harness.syncSplitFixtureGraph()
  harness.syncFixtureTabWithoutLeaf()
  await harness.runtime.closeTerminalSurfaceFromRenderer({
    worktreeId: WORKTREE_ID,
    target: { kind: 'pane', tabId: TAB_ID, leafId: LEAF_ID }
  })
  return harness
}

describe('closing one pane of a split tab', () => {
  it('persists the same workspace session through the CLI close as through the renderer report', async () => {
    const cli = await closeSplitPaneThroughCli()
    const renderer = await closeSplitPaneThroughRendererReport()

    expect(cli.getSession().terminalLayoutsByTabId[TAB_ID]?.root).toEqual({
      type: 'leaf',
      leafId: SIBLING_LEAF_ID
    })
    expect(cli.getSession()).toEqual(renderer.getSession())
  })

  it('differs only in stopping the process and telling the renderer to drop the leaf', async () => {
    const cli = await closeSplitPaneThroughCli()
    const renderer = await closeSplitPaneThroughRendererReport()

    expect(cli.closeTerminalPane).toHaveBeenCalledExactlyOnceWith(TAB_ID, LEAF_ID)
    expect(renderer.closeTerminalPane).not.toHaveBeenCalled()
    expect(cli.closeTerminalTab).not.toHaveBeenCalled()
    expect(renderer.closeTerminalTab).not.toHaveBeenCalled()
    // The renderer path leaves stopping the process to the renderer's own PTY transport.
    expect(cli.stopAndWait.mock.calls.map(([ptyId]) => ptyId)).toEqual([PTY_ID])
    expect(renderer.stopAndWait).not.toHaveBeenCalled()
  })
})
