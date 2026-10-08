import { callProjectFilterCli } from './helpers/project-filter-cli'
import { writeFileSync } from 'node:fs'
import { test, expect } from './helpers/orca-app'
import {
  createRuntimeDesktopPairingOffer,
  launchPairedElectronClient
} from './helpers/paired-electron-client'
import { callEnvironment } from './helpers/paired-host-terminal'
import { ProjectFilterResultSchema } from '../../src/shared/project-filter'

test('paired RPC and two hidden viewers keep independent project-filter acknowledgements', async ({
  orcaPage,
  electronApp,
  testRepoPath
}, testInfo) => {
  test.setTimeout(180000)
  const hostProfile = await electronApp.evaluate(({ app }) => app.getPath('userData'))
  const hostRepoId = await orcaPage.evaluate(() => window.__store!.getState().repos[0].id)
  const client = await launchPairedElectronClient(
    await createRuntimeDesktopPairingOffer(orcaPage),
    testInfo,
    'Filter peer'
  )
  const evidence: Record<string, unknown> = {}
  try {
    const pairedGet = ProjectFilterResultSchema.parse(
      await callEnvironment(client.page, client.environmentId, 'ui.projectFilter', {
        viewer: 'host',
        operation: 'get'
      })
    )
    expect(pairedGet.applied).toBe(true)
    evidence.pairedGet = pairedGet
    await expect
      .poll(() =>
        client.page.evaluate(
          (id) => window.__store!.getState().repos.some((repo) => repo.id === id),
          hostRepoId
        )
      )
      .toBe(true)
    const wrongRuntime = await callProjectFilterCli(client.userDataDir, 'get')
    expect(wrongRuntime.ok).toBe(false)
    expect(JSON.stringify(wrongRuntime.error)).toContain('viewer_runtime_mismatch')
    evidence.wrongRuntime = wrongRuntime
    const localRepoId = await client.page.evaluate(async (repoPath) => {
      const store = window.__store!
      if (!(await store.getState().setActiveRuntimeEnvironmentPreference(null))) {
        throw new Error('local_switch_failed')
      }
      const added = await window.api.repos.add({
        path: repoPath,
        displayName: 'Filter client local'
      })
      if ('error' in added) {
        throw new Error(added.error)
      }
      await store.getState().fetchReposForAllHosts()
      await store.getState().fetchWorktrees(added.repo.id, { forceLocalOwner: true })
      store.getState().setFilterRepoIds([])
      return added.repo.id
    }, testRepoPath)
    const localGet = await callProjectFilterCli(client.userDataDir, 'get')
    expect(localGet.ok).toBe(true)
    expect(localGet.result).toMatchObject({ repoIds: [], applied: true, persisted: true })
    const clientSet = await callProjectFilterCli(client.userDataDir, 'set', [localRepoId])
    expect(clientSet.result).toMatchObject({
      repoIds: [localRepoId],
      applied: true,
      persisted: true
    })
    const hostSet = await callProjectFilterCli(hostProfile, 'set', [hostRepoId])
    expect(hostSet.result).toMatchObject({ repoIds: [hostRepoId], applied: true })
    const clientStillLocal = await callProjectFilterCli(client.userDataDir, 'get')
    expect(clientStillLocal.result).toMatchObject({ repoIds: [localRepoId], applied: true })
    expect(clientStillLocal._meta.runtimeId).not.toBe(hostSet._meta.runtimeId)
    const pairedSet = ProjectFilterResultSchema.parse(
      await callEnvironment(client.page, client.environmentId, 'ui.projectFilter', {
        viewer: 'host',
        operation: 'set',
        repoIds: [hostRepoId]
      })
    )
    expect(pairedSet).toMatchObject({ repoIds: [hostRepoId], applied: true, persisted: true })
    evidence.independent = { localGet, clientSet, hostSet, clientStillLocal, pairedSet }
    await client.page.screenshot({ path: testInfo.outputPath('client-local.png') })
    await orcaPage.screenshot({ path: testInfo.outputPath('host-selected.png') })

    await client.page.evaluate(() => window.__store!.getState().setSidebarOpen(false))
    await expect(client.page.locator('[data-worktree-sidebar]')).toHaveCount(0)
    const staleClient = await callProjectFilterCli(client.userDataDir, 'get')
    expect(staleClient.result).toMatchObject({
      persisted: true,
      applied: false,
      visibleWorktreeIds: null
    })
    const liveHost = await callProjectFilterCli(hostProfile, 'get')
    expect(liveHost.result).toMatchObject({ applied: true, repoIds: [hostRepoId] })
    evidence.oneStale = { staleClient, liveHost }
    await client.page.evaluate(() => window.__store!.getState().setSidebarOpen(true))

    evidence.pairedClear = ProjectFilterResultSchema.parse(
      await callEnvironment(client.page, client.environmentId, 'ui.projectFilter', {
        viewer: 'host',
        operation: 'clear'
      })
    )
    expect(evidence.pairedClear).toMatchObject({ repoIds: [], applied: true, persisted: true })
    await client.page.evaluate(async (environmentId) => {
      await window.api.runtimeEnvironments.remove({ selector: environmentId })
      window.__store!.getState().setRuntimeEnvironments(await window.api.runtimeEnvironments.list())
      await window.__store!.getState().fetchReposForAllHosts()
    }, client.environmentId)
    expect(localRepoId).not.toBe(hostRepoId)
    await expect
      .poll(() =>
        client.page.evaluate(
          (id) => window.__store!.getState().repos.some((repo) => repo.id === id),
          hostRepoId
        )
      )
      .toBe(false)
    const rejected = await callProjectFilterCli(client.userDataDir, 'set', [hostRepoId])
    expect(rejected.ok).toBe(false)
    expect(JSON.stringify(rejected.error)).toContain('project_not_found')
    evidence.staleRepo = rejected
    const clientClear = await callProjectFilterCli(client.userDataDir, 'clear')
    expect(clientClear.result).toMatchObject({ repoIds: [], applied: true, persisted: true })
    evidence.clientClear = clientClear
    const hostClear = await callProjectFilterCli(hostProfile, 'clear')
    expect(hostClear.result).toMatchObject({ repoIds: [], applied: true })
    evidence.hostClear = hostClear
    for (const app of [electronApp, client.app]) {
      expect(
        await app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().every(
            (window) => !window.isVisible() && !window.isFocused()
          )
        )
      ).toBe(true)
    }
    writeFileSync(testInfo.outputPath('peer-results.json'), JSON.stringify(evidence, null, 2))
  } finally {
    await client.dispose()
  }
})
