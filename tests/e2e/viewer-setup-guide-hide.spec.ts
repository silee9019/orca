import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect } from './helpers/orca-app'
import { runViewerFixtureProcess } from './helpers/viewer-fixture-process'
import { SetupGuideResultSchema } from '../../src/shared/setup-guide-command'

test('setup guide hide CLI uses the original modal button without acknowledging storage', async ({
  orcaPage,
  electronApp
}, testInfo) => {
  const manifest = await electronApp.evaluate(({ app }) => ({
    pid: process.pid,
    userData: app.getPath('userData'),
    backgroundLaunch: process.env.ORCA_BACKGROUND_LAUNCH
  }))
  writeFileSync(testInfo.outputPath('process-manifest.json'), JSON.stringify(manifest, null, 2))
  const assertHidden = async () =>
    expect(
      await electronApp.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().every((window) => !window.isVisible() && !window.isFocused())
      )
    ).toBe(true)
  const responses: unknown[] = []
  const call = async (operation: 'open' | 'hide-sidebar' = 'open', errorCode?: string) => {
    const expectError = errorCode !== undefined
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('ORCA_'))
    )
    try {
      const { stdout } = await runViewerFixtureProcess({
        program: process.execPath,
        args: [
          path.join(process.cwd(), 'out/cli/index.js'),
          'ui',
          'setup-guide',
          operation,
          '--viewer',
          'host',
          '--json'
        ],
        env: { ...env, ORCA_USER_DATA_PATH: manifest.userData, ORCA_BACKGROUND_LAUNCH: '1' },
        timeoutMs: 20000
      })
      expect(expectError).toBe(false)
      const envelope = JSON.parse(stdout)
      responses.push(envelope)
      writeFileSync(testInfo.outputPath('cli-results.json'), JSON.stringify(responses, null, 2))
      expect(envelope._meta.runtimeId).toBeTruthy()
      return SetupGuideResultSchema.parse(envelope.result)
    } catch (error) {
      if (error instanceof Error && 'stdout' in error) {
        writeFileSync(
          testInfo.outputPath('cli-failure.json'),
          JSON.stringify({ stdout: error.stdout, expected: expectError }, null, 2)
        )
      }
      if (!expectError) {
        throw error
      }
      if (!(error instanceof Error) || !('stdout' in error) || typeof error.stdout !== 'string') {
        throw error
      }
      expect(error.message).toContain('viewer_fixture_process_failed')
      expect(error.stdout).toContain(errorCode)
      responses.push({ rejected: true, stdout: error.stdout })
      writeFileSync(testInfo.outputPath('cli-results.json'), JSON.stringify(responses, null, 2))
      return null
    }
  }
  await orcaPage.waitForFunction(
    () =>
      window.__store?.getState().persistedUIReady &&
      window.__store?.getState().workspaceSessionReady
  )
  await expect
    .poll(() => orcaPage.evaluate(() => window.__store?.getState().activeModal))
    .toBe('none')
  await assertHidden()
  const dialog = orcaPage.locator('[role="dialog"][data-setup-guide-dialog="true"]')
  const read = async () => {
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveAttribute('data-setup-guide-open', 'true')
    await expect(dialog).toHaveAttribute('data-setup-guide-source', 'help_menu')
    const stepId = await dialog.getAttribute('data-setup-guide-step')
    expect(stepId).toBeTruthy()
    const selected = dialog.locator('button[aria-current="step"]')
    await expect(selected).toHaveCount(1)
    await expect(selected).toHaveAttribute('data-setup-guide-step-id', stepId ?? '')
    const content = dialog.locator('[data-setup-guide-content-step]')
    await expect(content).toHaveAttribute('data-setup-guide-content-step', stepId ?? '')
    const heading = content.locator('h3')
    const description = content.locator('[data-setup-guide-description]')
    const action = content.locator('[data-setup-guide-action]')
    await expect(heading).toBeInViewport()
    await expect(description).toBeInViewport()
    const actionChildCount = await action.evaluate((node) => node.childElementCount)
    if (actionChildCount > 0) {
      await expect(action).toBeInViewport()
    } else {
      expect(stepId).toBe('two-worktrees')
      await expect(content.locator('[data-setup-guide-completed="true"]')).toBeInViewport()
    }
    expect((await heading.textContent())?.trim()).toBeTruthy()
    expect((await description.textContent())?.trim()).toBeTruthy()
    return {
      stepId,
      actionChildCount,
      title: await heading.textContent(),
      description: await description.textContent(),
      source: await dialog.getAttribute('data-setup-guide-source')
    }
  }
  const baselineUI = await orcaPage.evaluate(() => window.api.ui.get())
  await electronApp.evaluate(({ ipcMain }, baseline) => {
    let dismissed = false
    let failWrites = false
    let payloads: unknown[] = []
    ipcMain.removeHandler('ui:set')
    ipcMain.removeHandler('ui:get')
    ipcMain.handle('ui:set', (_event, updates) => {
      if (updates.setupGuideSidebarDismissed !== undefined) {
        payloads.push({ setupGuideSidebarDismissed: updates.setupGuideSidebarDismissed })
        if (failWrites) {
          throw new Error('isolated fixture storage rejection')
        }
        dismissed = updates.setupGuideSidebarDismissed
      }
    })
    ipcMain.handle('ui:get', () => ({ ...baseline, setupGuideSidebarDismissed: dismissed }))
    ipcMain.on('viewer-fixture:reset-hide', (_event, fail: boolean) => {
      dismissed = false
      failWrites = fail
      payloads = []
    })
    ipcMain.on(
      'viewer-fixture:observe-hide',
      (reply: (data: { dismissed: boolean; payloads: unknown[] }) => void) =>
        reply({ dismissed, payloads })
    )
  }, baselineUI)
  const observeHost = () =>
    electronApp.evaluate(
      ({ ipcMain }) =>
        new Promise<{ dismissed: boolean; payloads: unknown[] }>((resolve) => {
          ipcMain.emit('viewer-fixture:observe-hide', resolve)
        })
    )
  const entry = orcaPage.locator('[data-contextual-tour-target="setup-guide-entry"]')
  const comparisons: unknown[] = []
  for (const failWrites of [false, true]) {
    const effects: unknown[] = []
    for (const origin of ['original', 'cli'] as const) {
      await electronApp.evaluate(
        ({ ipcMain }, fail) => ipcMain.emit('viewer-fixture:reset-hide', null, fail),
        failWrites
      )
      await orcaPage.evaluate(() => {
        const store = window.__store
        const settings = store?.getState().settings
        if (!store || !settings) {
          throw new Error('fixture settings missing')
        }
        store.setState({
          settings: {
            ...settings,
            defaultTuiAgent: 'blank',
            notifications: { ...settings.notifications, enabled: true, agentTaskComplete: true }
          },
          setupGuideBrowserMilestoneMigrated: true,
          setupGuideBrowserMilestoneLegacyComplete: false,
          setupGuideSidebarDismissed: false
        })
      })
      await expect(entry).toBeVisible()
      await expect(entry).toBeInViewport()
      expect(
        await orcaPage.evaluate(async () => (await window.api.ui.get()).setupGuideSidebarDismissed)
      ).toBe(false)
      await electronApp.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed())
        if (!window) {
          throw new Error('fixture window missing')
        }
        window.webContents.send('ui:openSetupGuide')
      })
      const before = await read()
      const revision = await dialog.getAttribute('data-setup-guide-selection-revision')
      await dialog.evaluate((node) => {
        node.setAttribute('data-hide-fixture-identity', 'owned')
      })
      const button = dialog.locator('button[data-setup-guide-hide-sidebar="true"]')
      await expect(button).toBeVisible()
      await expect(button).toBeInViewport()
      await orcaPage.screenshot({
        path: testInfo.outputPath(`${failWrites ? 'failure' : 'accepted'}-${origin}-before.png`)
      })
      if (origin === 'original') {
        await button.click()
      } else {
        expect(await call('hide-sidebar')).toMatchObject({
          applied: true,
          sidebarDismissed: true,
          changed: true,
          writeOutcome: 'unverified',
          diskPersistence: 'unverified'
        })
      }
      await expect
        .poll(() => orcaPage.evaluate(() => window.__store?.getState().setupGuideSidebarDismissed))
        .toBe(true)
      await expect(entry).toHaveCount(0)
      expect(await read()).toEqual(before)
      await expect(dialog).toHaveAttribute('data-hide-fixture-identity', 'owned')
      await expect(dialog).toHaveAttribute('data-setup-guide-selection-revision', revision ?? '')
      const host = await observeHost()
      expect(host.payloads).toEqual([{ setupGuideSidebarDismissed: true }])
      expect(host.dismissed).toBe(!failWrites)
      expect(
        await orcaPage.evaluate(async () => (await window.api.ui.get()).setupGuideSidebarDismissed)
      ).toBe(!failWrites)
      if (origin === 'cli') {
        expect(await call('hide-sidebar')).toMatchObject({
          applied: true,
          changed: false,
          writeOutcome: 'unverified',
          diskPersistence: 'unverified'
        })
        expect(await observeHost()).toEqual(host)
      }
      await orcaPage.screenshot({
        path: testInfo.outputPath(`${failWrites ? 'failure' : 'accepted'}-${origin}-after.png`)
      })
      effects.push({
        origin,
        before,
        after: await read(),
        selectionRevision: revision,
        host,
        renderedDismissal: true,
        sidebarEntryRemoved: true
      })
      await orcaPage.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
      expect(await call('hide-sidebar', 'setup_guide_not_open')).toBeNull()
    }
    comparisons.push({ failWrites, effects })
  }
  writeFileSync(
    testInfo.outputPath('equivalence.json'),
    JSON.stringify(
      {
        comparisons,
        sourceScope: 'existing Help modal hide button only',
        fixtureScope: 'isolated main ui:set/ui:get handler; no disk write',
        progressSeed: 'incomplete/migrated true/legacy false/dismissed false',
        originalNativeMenu: false,
        sidebarContextMenuActual: false,
        writeOutcome: 'unverified',
        diskPersistence: 'unverified',
        serviceWriteObservation: 'only dismissal payloads observed in isolated handler'
      },
      null,
      2
    )
  )
  await assertHidden()
})
