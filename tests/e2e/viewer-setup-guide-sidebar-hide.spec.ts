import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect } from './helpers/orca-app'
import { runViewerFixtureProcess } from './helpers/viewer-fixture-process'
import { SetupGuideSidebarHideResultSchema } from '../../src/shared/setup-guide-command'

test('setup guide sidebar hide CLI selects the original context menu item without acknowledging storage', async ({
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
  const call = async (errorCode?: string) => {
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
          'hide-sidebar-entry',
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
      return SetupGuideSidebarHideResultSchema.parse(envelope.result)
    } catch (error) {
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
  await assertHidden()
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
    ipcMain.on('viewer-fixture:observe-hide', (reply: unknown) => {
      if (typeof reply === 'function') {
        reply({ dismissed, payloads })
      }
    })
  }, baselineUI)
  const observeHost = () =>
    electronApp.evaluate(
      ({ ipcMain }) =>
        new Promise<{ dismissed: boolean; payloads: unknown[] }>((resolve) => {
          ipcMain.emit('viewer-fixture:observe-hide', resolve)
        })
    )
  const readRendered = () =>
    orcaPage.evaluate(() => {
      const state = window.__store?.getState()
      const active = document.activeElement
      return {
        activeModal: state?.activeModal,
        activeView: state?.activeView,
        activeWorktreeId: state?.activeWorktreeId,
        sidebarOpen: state?.sidebarOpen,
        migrated: state?.setupGuideBrowserMilestoneMigrated,
        legacyComplete: state?.setupGuideBrowserMilestoneLegacyComplete,
        dismissed: state?.setupGuideSidebarDismissed,
        focus: active
          ? {
              tag: active.tagName,
              target: active.getAttribute('data-contextual-tour-target'),
              inBody: active === document.body
            }
          : null
      }
    })
  const entry = orcaPage.locator('[data-contextual-tour-target="setup-guide-entry"]')
  const menu = orcaPage.locator('[data-setup-guide-sidebar-menu-owner]')
  const hideItem = menu.locator('[role="menuitem"][data-setup-guide-sidebar-hide="true"]')
  const seed = async (failWrites: boolean) => {
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
        sidebarOpen: true,
        setupGuideBrowserMilestoneMigrated: true,
        setupGuideBrowserMilestoneLegacyComplete: false,
        setupGuideSidebarDismissed: false
      })
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
      }
    })
    await orcaPage.mouse.move(1200, 700)
    await expect(entry).toBeVisible()
    await expect(entry).toBeInViewport()
  }
  const comparisons: unknown[] = []
  for (const failWrites of [false, true]) {
    const effects: { host: unknown; before: { focus: unknown }; after: { focus: unknown } }[] = []
    for (const origin of ['original', 'cli'] as const) {
      const tag = `${failWrites ? 'failure' : 'accepted'}-${origin}`
      await seed(failWrites)
      await expect(menu).toHaveCount(0)
      expect(
        await orcaPage.evaluate(async () => (await window.api.ui.get()).setupGuideSidebarDismissed)
      ).toBe(false)
      const before = await readRendered()
      expect(before).toMatchObject({ activeModal: 'none', sidebarOpen: true, dismissed: false })
      await orcaPage.evaluate(() => {
        const diagnostics: unknown[] = []
        const observer = new MutationObserver((records) => {
          for (const record of records) {
            if (record.type === 'attributes' && record.target instanceof HTMLElement) {
              diagnostics.push({
                target: record.target.tagName,
                attribute: record.attributeName,
                old: record.oldValue,
                now: record.target.getAttribute(record.attributeName ?? '')
              })
            }
          }
        })
        for (
          let node: HTMLElement | null = document.querySelector(
            '[data-contextual-tour-target="setup-guide-entry"]'
          );
          node;
          node = node.parentElement
        ) {
          observer.observe(node, {
            attributes: true,
            attributeOldValue: true,
            attributeFilter: ['hidden', 'inert', 'aria-hidden', 'style', 'class']
          })
        }
        Object.assign(window, { sidebarHideDiagnostics: diagnostics })
      })
      await orcaPage.screenshot({ path: testInfo.outputPath(`${tag}-before.png`) })
      let menuItems: string[] = []
      if (origin === 'original') {
        await entry.click({ button: 'right' })
        await expect(menu).toHaveCount(1)
        await expect(menu).toHaveAttribute('role', 'menu')
        await expect(menu).toHaveAttribute('data-state', 'open')
        await expect(hideItem).toHaveCount(1)
        await expect(hideItem).toBeVisible()
        await expect(menu).toHaveCSS('opacity', '1')
        menuItems = await menu.locator('[role="menuitem"]').allTextContents()
        expect(menuItems).toHaveLength(1)
        await orcaPage.screenshot({ path: testInfo.outputPath(`${tag}-menu.png`) })
        await hideItem.click()
      } else {
        const blocker = orcaPage.locator('[data-sidebar-hide-blocking-fixture]')
        await orcaPage.evaluate(() => {
          const node = document.createElement('div')
          node.setAttribute('role', 'alertdialog')
          node.dataset.sidebarHideBlockingFixture = 'true'
          node.textContent = 'Existing decision'
          Object.assign(node.style, {
            position: 'fixed',
            top: '20px',
            left: '320px',
            width: '200px',
            height: '80px',
            zIndex: '1001'
          })
          document.body.append(node)
        })
        await expect(blocker).toBeInViewport()
        expect(await call('viewer_modal_already_open')).toBeNull()
        await expect(menu).toHaveCount(0)
        await expect(entry).toBeVisible()
        await blocker.evaluate((node) => node.remove())
        expect((await observeHost()).payloads).toEqual([])
        const result = await call()
        expect(result).toMatchObject({
          applied: true,
          source: 'sidebar',
          sidebarDismissed: true,
          sidebarEntryPresent: false,
          menuPresent: false,
          changed: true,
          writeOutcome: 'unverified',
          diskPersistence: 'unverified'
        })
      }
      await expect
        .poll(() => orcaPage.evaluate(() => window.__store?.getState().setupGuideSidebarDismissed))
        .toBe(true)
      await expect(entry).toHaveCount(0)
      await expect(menu).toHaveCount(0)
      const after = await readRendered()
      const ancestorVisibilityMutations = await orcaPage.evaluate(() =>
        Reflect.get(window, 'sidebarHideDiagnostics')
      )
      expect(ancestorVisibilityMutations).toEqual([])
      expect({ ...after, focus: null, dismissed: true }).toEqual({
        ...before,
        focus: null,
        dismissed: true
      })
      const host = await observeHost()
      expect(host.payloads).toEqual([{ setupGuideSidebarDismissed: true }])
      expect(host.dismissed).toBe(!failWrites)
      expect(
        await orcaPage.evaluate(async () => (await window.api.ui.get()).setupGuideSidebarDismissed)
      ).toBe(!failWrites)
      await orcaPage.screenshot({ path: testInfo.outputPath(`${tag}-after.png`) })
      if (origin === 'cli') {
        expect(await call('setup_guide_sidebar_entry_unavailable')).toBeNull()
        expect(await observeHost()).toEqual(host)
      }
      const effect = { origin, before, after, menuItems, host, ancestorVisibilityMutations }
      effects.push(effect)
    }
    const [original, cli] = effects
    if (!original || !cli) {
      throw new Error('missing origin effects')
    }
    expect(cli.host).toEqual(original.host)
    expect(cli.before.focus).toEqual(original.before.focus)
    comparisons.push({
      failWrites,
      effects,
      focusEqual: JSON.stringify(cli.after.focus) === JSON.stringify(original.after.focus)
    })
  }
  const summarize = (result: Awaited<ReturnType<typeof call>>) =>
    result && {
      applied: result.applied,
      reason: result.reason,
      sidebarDismissed: result.sidebarDismissed,
      sidebarEntryPresent: result.sidebarEntryPresent,
      menuPresent: result.menuPresent
    }
  const detection: unknown[] = []
  for (const injected of ['ancestor-class', 'transient-owner-menu'] as const) {
    await seed(false)
    await orcaPage.evaluate((kind) => {
      Reflect.set(window, 'sidebarHideInjected', false)
      const owner = document
        .querySelector('[data-setup-guide-sidebar-owner]')
        ?.getAttribute('data-setup-guide-sidebar-owner')
      document.addEventListener(
        'click',
        () => {
          Reflect.set(window, 'sidebarHideInjected', true)
          if (kind === 'ancestor-class') {
            document.documentElement.classList.add('sidebar-hide-fixture')
            document.documentElement.classList.remove('sidebar-hide-fixture')
          } else {
            const node = document.createElement('div')
            node.dataset.setupGuideSidebarMenuOwner = owner ?? ''
            document.body.append(node)
            node.remove()
          }
        },
        { capture: true, once: true }
      )
    }, injected)
    const result = await call()
    expect(result).toMatchObject({
      applied: false,
      reason: 'viewer_surface_superseded',
      changed: false,
      writeOutcome: 'unverified',
      diskPersistence: 'unverified'
    })
    expect(await orcaPage.evaluate(() => Reflect.get(window, 'sidebarHideInjected'))).toBe(true)
    expect((await observeHost()).payloads).toEqual([{ setupGuideSidebarDismissed: true }])
    detection.push({ injected, result: summarize(result) })
  }
  await seed(false)
  const terminalStartFocus = await orcaPage.evaluate(() => {
    document.querySelector<HTMLElement>('textarea.xterm-helper-textarea')?.focus()
    return document.activeElement?.tagName ?? null
  })
  expect(await call()).toMatchObject({ applied: true })
  const terminalFocusCli = { startFocus: terminalStartFocus, after: (await readRendered()).focus }
  writeFileSync(
    testInfo.outputPath('equivalence.json'),
    JSON.stringify(
      {
        comparisons,
        detection,
        terminalFocusCli,
        sourceScope: 'sidebar entry context menu hide item only',
        fixtureScope:
          'isolated main ui:set/ui:get handler records dismissal payloads only; other IPC, disk writes and the user login shell hooks are not isolated',
        progressSeed: 'incomplete/migrated true/legacy false/dismissed false',
        originalNativeMenu: false,
        writeOutcome: 'unverified',
        diskPersistence: 'unverified',
        otherWritesObservation: 'not_performed',
        screenshotNote:
          'terminal prompt in PNG and process-isolation records may carry account identifiers; review or crop before external use'
      },
      null,
      2
    )
  )
  await assertHidden()
})
