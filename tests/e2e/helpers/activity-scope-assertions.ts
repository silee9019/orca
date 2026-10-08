import { expect, type Page, type TestInfo } from '@playwright/test'
import type { ActivityViewerResult } from '../../../src/shared/activity-viewer-command'

export async function assertActivityScopeControls(
  page: Page,
  call: (args: string[], surface?: string) => Promise<ActivityViewerResult>,
  testInfo: TestInfo
): Promise<void> {
  await page.evaluate(() => {
    const store = window.__store
    if (!store) {
      throw new Error('store unavailable')
    }
    const state = store.getState()
    const worktreesByRepo = Object.fromEntries(
      Object.entries(state.worktreesByRepo).map(([repoId, worktrees]) => [
        repoId,
        worktrees.map((worktree) => ({
          ...worktree,
          ...(worktree.id === 'activity-wt-0'
            ? {
                cliProvenance: { kind: 'created-by-cli' as const, createdAt: 1 },
                creatorProvenance: { kind: 'paired-device' as const, deviceId: 'fixture-client' }
              }
            : {
                automationProvenance: {
                  kind: 'created-by-automation' as const,
                  automationId: 'fixture-automation',
                  automationNameSnapshot: 'Fixture automation',
                  automationRunId: 'fixture-run',
                  automationRunTitleSnapshot: 'Fixture run',
                  createdAt: 1,
                  executionTargetType: 'local' as const,
                  executionTargetId: worktree.id,
                  projectId: repoId
                }
              })
        }))
      ])
    )
    store.setState({
      worktreesByRepo,
      sshTargetLabels: new Map([...state.sshTargetLabels, ['activity-fixture', 'Fixture SSH']])
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
    const rows = list.getByRole('listitem')
    const run = (args: string[]) => call(['activity', ...args], surface)
    expect(await run(['scope-reset'])).toMatchObject({ applied: true })
    await expect(rows).toHaveCount(3)
    for (const [kind, count] of [
      ['cli', 1],
      ['automation', 2]
    ] as const) {
      expect(await run(['origin', '--kind', kind, '--hidden', 'true'])).toMatchObject({
        applied: true,
        persisted: true,
        writeOutcome: 'accepted'
      })
      await expect(rows).toHaveCount(count)
      await expect(
        rows.filter({ hasText: `Activity task ${kind === 'cli' ? 'a' : 'b'}` })
      ).toHaveCount(0)
      await list.screenshot({ path: testInfo.outputPath(`${surface}-origin-${kind}.png`) })
      await run(['origin', '--kind', kind, '--hidden', 'false'])
      await expect(rows).toHaveCount(3)
    }
    // This catalog fixture exercises the pre-hydration gate without contacting a paired host.
    await page.evaluate(() =>
      window.__store?.setState({ runtimeEnvironmentCatalogHydrated: false })
    )
    expect(await run(['origin', '--kind', 'other-client', '--hidden', 'true'])).toMatchObject({
      applied: true,
      persisted: true
    })
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText('Activity task b')
    await run(['origin', '--kind', 'other-client', '--hidden', 'false'])
    await expect(rows).toHaveCount(3)
    await run(['host-toggle', '--host', 'local'])
    expect(await run(['host-toggle', '--host', 'local'])).toMatchObject({
      applied: true,
      dispatched: false,
      writeOutcome: 'not_requested'
    })
    await expect(rows).toHaveCount(3)
    await run(['host-toggle', '--host', 'ssh:activity-fixture'])
    expect(await run(['host-toggle', '--host', 'ssh:activity-fixture'])).toMatchObject({
      applied: true,
      persisted: true,
      persistedScope: { visibleHostIds: ['ssh:activity-fixture'] }
    })
    await expect(rows).toHaveCount(0)
    await list.screenshot({ path: testInfo.outputPath(`${surface}-host-empty.png`) })
    await run(['hosts-toggle-all'])
    await expect(rows).toHaveCount(3)
    await run(['hosts-toggle-all'])
    await expect(rows).toHaveCount(3)
    await run(['origin', '--kind', 'cli', '--hidden', 'true'])
    await run(['search', '--query', 'Activity task b'])
    await page.evaluate(async () => {
      const state = window.__store?.getState()
      await Promise.all([
        state?.setAgentsVisibleHostIds(['local']),
        state?.setAgentsFilterRepoIds(['activity-repo-a'])
      ])
    })
    await expect(rows).toHaveCount(0)
    expect(await run(['scope-reset'])).toMatchObject({
      applied: true,
      persisted: true,
      writeOutcome: 'accepted',
      persistedScope: { visibleHostIds: null, filterRepoIds: [], hideCli: true },
      rendered: { query: 'Activity task b', readFilter: 'all', showChildAgents: true }
    })
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText('Activity task b')
    await list.screenshot({ path: testInfo.outputPath(`${surface}-scope-reset-query.png`) })
    expect(await run(['scope-reset'])).toMatchObject({
      applied: true,
      dispatched: false,
      writeOutcome: 'not_requested'
    })
    await run(['search', '--query', ''])
    await run(['origin', '--kind', 'cli', '--hidden', 'false'])
    await expect(rows).toHaveCount(3)
  }
  await page.evaluate(() => {
    const state = window.__store?.getState()
    state?.setSidebarOpen(false)
    state?.setActiveView('terminal')
  })
  await expect(call(['activity', 'origin', '--kind', 'cli', '--hidden', 'true'])).rejects.toThrow()
  await page.evaluate(() => window.__store?.getState().setActiveView('activity'))
  await expect(
    page.locator('[data-activity-viewer="activity-page"]').getByRole('listitem')
  ).toHaveCount(3)
  expect(await call(['activity', 'scope-reset'])).toMatchObject({
    applied: true,
    dispatched: false,
    persistedScope: { hideCli: false, visibleHostIds: null, filterRepoIds: [] }
  })
}
