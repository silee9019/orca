import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect } from './helpers/orca-app'
import { runViewerFixtureProcess } from './helpers/viewer-fixture-process'
import { SetupGuideResultSchema } from '../../src/shared/setup-guide-command'

test('setup guide step CLI uses the original row and preserves same-step selection', async ({
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
  const call = async (operation: 'open' | 'select-step' = 'open', errorCode?: string) => {
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
          ...(operation === 'select-step' ? ['--step', 'two-worktrees'] : []),
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
  await orcaPage.screenshot({ path: testInfo.outputPath('before.png') })
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
  const trackActionClicks = async () =>
    dialog.evaluate((node) => {
      node.setAttribute('data-step-fixture-action-clicks', '0')
      node.addEventListener(
        'click',
        (event) => {
          if (
            event.target instanceof Element &&
            event.target.closest('[data-setup-guide-action]')
          ) {
            node.setAttribute(
              'data-step-fixture-action-clicks',
              String(Number(node.getAttribute('data-step-fixture-action-clicks')) + 1)
            )
          }
        },
        true
      )
    })
  const actionClicks = async () =>
    Number(await dialog.getAttribute('data-step-fixture-action-clicks'))
  const comparisons: unknown[] = []
  for (const seed of ['incomplete', 'complete'] as const) {
    const progressSeed = await orcaPage.evaluate((value) => {
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
        setupGuideBrowserMilestoneLegacyComplete: value === 'complete'
      })
      return {
        seed: value,
        defaultTuiAgent: 'blank',
        browserMilestoneMigrated: true,
        browserMilestoneLegacyComplete: value === 'complete',
        scope: 'isolated in-memory fixture'
      }
    }, seed)
    await electronApp.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed())
      if (!window) {
        throw new Error('fixture window missing')
      }
      window.webContents.send('ui:openSetupGuide')
    })
    const initial = await read()
    expect(initial.stepId).toBe(seed === 'complete' ? 'two-worktrees' : 'default-agent')
    const revision = async () =>
      Number(await dialog.getAttribute('data-setup-guide-selection-revision'))
    await trackActionClicks()
    const originalBefore = await revision()
    await dialog.locator('button[data-setup-guide-step-id="two-worktrees"]').click()
    await expect.poll(revision).toBe(originalBefore + 1)
    const original = await read()
    expect(await actionClicks()).toBe(0)
    expect(original.stepId).toBe('two-worktrees')
    await dialog.screenshot({ path: testInfo.outputPath(`${seed}-original.png`) })
    await orcaPage.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    expect(await call()).toMatchObject({ applied: true, stepId: initial.stepId })
    await trackActionClicks()
    const cliBefore = await revision()
    expect(await call('select-step')).toMatchObject({ applied: true, stepId: 'two-worktrees' })
    await expect.poll(revision).toBe(cliBefore + 1)
    const cli = await read()
    expect(cli).toEqual(original)
    await dialog.screenshot({ path: testInfo.outputPath(`${seed}-cli.png`) })
    const sameBefore = await revision()
    expect(await call('select-step')).toMatchObject({ applied: true, stepId: 'two-worktrees' })
    await expect.poll(revision).toBe(sameBefore + 1)
    expect(await read()).toEqual(cli)
    expect(await actionClicks()).toBe(0)
    comparisons.push({
      progressSeed,
      initialStep: initial.stepId,
      original,
      cli,
      originalRevisionDelta: 1,
      cliRevisionDelta: 1,
      sameStepRevisionDelta: 1,
      originalActionClickCount: 0,
      cliActionClickCount: 0
    })
    await orcaPage.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    expect(await call('select-step', 'setup_guide_not_open')).toBeNull()
  }

  await orcaPage.evaluate(() => {
    const node = document.createElement('div')
    node.setAttribute('role', 'alertdialog')
    node.dataset.setupGuideBlockingFixture = 'true'
    node.textContent = 'Existing decision'
    Object.assign(node.style, {
      position: 'fixed',
      top: '20px',
      left: '20px',
      width: '200px',
      height: '80px',
      zIndex: '1001'
    })
    document.body.append(node)
  })
  const blocker = orcaPage.locator('[data-setup-guide-blocking-fixture]')
  await expect(blocker).toBeVisible()
  await expect(blocker).toBeInViewport()
  expect(await call('open', 'viewer_modal_already_open')).toBeNull()
  await expect(blocker).toHaveText('Existing decision')
  await expect(dialog).toHaveCount(0)
  expect(await orcaPage.evaluate(() => window.__store?.getState().activeModal)).toBe('none')
  await blocker.evaluate((node) => node.remove())
  writeFileSync(
    testInfo.outputPath('equivalence.json'),
    JSON.stringify(
      {
        comparisons,
        originalDispatch: 'original setup guide row button click',
        sameStepOriginalCallback: true,
        sourceScope: 'existing Help modal only',
        serviceWriteObservation: 'not measured; local selection rendering only',
        originalNativeMenu: false,
        closedGuideRefused: true,
        openWithIndependentAlertDialogRefused: true,
        passiveStorageAck: 'unverified',
        assetAndServicesReady: 'unverified'
      },
      null,
      2
    )
  )
  await assertHidden()
})
