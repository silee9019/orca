import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect } from './helpers/orca-app'
import { runViewerFixtureProcess } from './helpers/viewer-fixture-process'
import { FeatureTourResultSchema } from '../../src/shared/feature-tour-command'

test('feature tour CLI reaches the original help dialog without replacing existing overlays', async ({
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
  const call = async (expectError = false) => {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('ORCA_'))
    )
    try {
      const { stdout } = await runViewerFixtureProcess({
        program: process.execPath,
        args: [
          path.join(process.cwd(), 'out/cli/index.js'),
          'ui',
          'feature-tour',
          'open',
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
      return FeatureTourResultSchema.parse(envelope.result)
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
      expect(error.stdout).toContain('viewer_modal_already_open')
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
  const dialog = orcaPage.locator('[role="dialog"][data-feature-tour-dialog="true"]')
  const read = async () => {
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveAttribute('data-feature-tour-source', 'help_menu')
    const tab = dialog.locator(
      'button[role="tab"][aria-selected="true"][data-feature-wall-workflow-id]'
    )
    await expect(tab).toHaveCount(1)
    const panelId = await tab.getAttribute('aria-controls')
    expect(panelId).toBeTruthy()
    const panel = dialog.locator('[role="tabpanel"]')
    await expect(panel).toHaveAttribute('id', panelId ?? '')
    const heading = panel.locator('h3')
    await expect(heading).toBeVisible()
    expect((await heading.textContent())?.trim()).toBeTruthy()
    await expect(panel).toHaveAttribute('aria-labelledby', (await heading.getAttribute('id')) ?? '')
    return {
      workflowId: await tab.getAttribute('data-feature-wall-workflow-id'),
      title: await heading.textContent(),
      source: await dialog.getAttribute('data-feature-tour-source')
    }
  }
  await electronApp.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed())
    if (!window) {
      throw new Error('fixture window missing')
    }
    window.webContents.send('ui:openFeatureTour')
  })
  const original = await read()
  await dialog.screenshot({ path: testInfo.outputPath('original.png') })
  expect(await call(true)).toBeNull()
  expect(await read()).toEqual(original)
  await orcaPage.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect
    .poll(() => orcaPage.evaluate(() => window.__store?.getState().activeModal))
    .toBe('none')
  const result = await call()
  expect(result).toMatchObject({
    applied: true,
    dialogPresent: true,
    contentPresent: true,
    source: 'help_menu',
    workflowId: original.workflowId
  })
  const cli = await read()
  expect(cli).toEqual(original)
  await dialog.screenshot({ path: testInfo.outputPath('cli.png') })
  await orcaPage.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await orcaPage.evaluate(() => {
    const node = document.createElement('div')
    node.setAttribute('role', 'alertdialog')
    node.dataset.featureTourBlockingFixture = 'true'
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
  const blocker = orcaPage.locator('[data-feature-tour-blocking-fixture]')
  await expect(blocker).toBeVisible()
  await expect(blocker).toBeInViewport()
  expect(await call(true)).toBeNull()
  await expect(blocker).toHaveText('Existing decision')
  await expect(dialog).toHaveCount(0)
  expect(await orcaPage.evaluate(() => window.__store?.getState().activeModal)).toBe('none')
  await blocker.evaluate((node) => node.remove())
  writeFileSync(
    testInfo.outputPath('equivalence.json'),
    JSON.stringify(
      {
        original,
        cli,
        originalDispatch: 'existing ui:openFeatureTour IPC handler',
        originalNativeMenu: false,
        activeModalRefused: true,
        independentAlertDialogRefused: true,
        passiveStorageAck: 'unverified',
        assetAndServicesReady: 'unverified'
      },
      null,
      2
    )
  )
  await assertHidden()
})
