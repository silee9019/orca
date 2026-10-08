import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect } from './helpers/orca-app'
import { runViewerFixtureProcess } from './helpers/viewer-fixture-process'
import { CrashReportResultSchema } from '../../src/shared/crash-report-command'
import type { CrashReportRecord } from '../../src/shared/crash-reporting'

test('crash report CLI opens the original shell through isolated providers without submitting or copying', async ({
  orcaPage,
  electronApp
}, testInfo) => {
  const manifest = await electronApp.evaluate(({ app }) => ({
    pid: process.pid,
    userData: app.getPath('userData'),
    backgroundLaunch: process.env.ORCA_BACKGROUND_LAUNCH
  }))
  writeFileSync(testInfo.outputPath('process-manifest.json'), JSON.stringify(manifest, null, 2))
  await orcaPage.waitForFunction(
    () =>
      window.__store?.getState().persistedUIReady &&
      window.__store?.getState().workspaceSessionReady
  )
  await expect
    .poll(() => orcaPage.evaluate(() => window.__store?.getState().activeModal))
    .toBe('none')
  const hidden = async () =>
    expect(
      await electronApp.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().every((window) => !window.isVisible() && !window.isFocused())
      )
    ).toBe(true)
  await hidden()
  await electronApp.evaluate(({ ipcMain }) => {
    process.env.ORCA_E2E_CRASH_VIEWER_COUNTS = '{}'
    const record = (key: string): void => {
      const counters = JSON.parse(process.env.ORCA_E2E_CRASH_VIEWER_COUNTS ?? '{}')
      counters[key] = (counters[key] ?? 0) + 1
      process.env.ORCA_E2E_CRASH_VIEWER_COUNTS = JSON.stringify(counters)
    }
    for (const key of [
      'getLatestPending',
      'getLatestReport',
      'dismiss',
      'submit',
      'copyLatestDiagnostics'
    ]) {
      ipcMain.removeHandler(`crashReports:${key}`)
      ipcMain.handle(`crashReports:${key}`, () => {
        record(key)
        if (key === 'getLatestPending') {
          return null
        }
        if (key !== 'getLatestReport') {
          throw new Error('forbidden_fixture_side_effect')
        }
        if (process.env.ORCA_E2E_CRASH_VIEWER_SEED !== 'report') {
          return null
        }
        const report: CrashReportRecord = {
          id: 'synthetic-crash',
          createdAt: '2026-10-08T00:00:00.000Z',
          status: 'dismissed',
          source: 'renderer',
          processType: 'renderer',
          reason: 'Synthetic fixture crash',
          exitCode: 1,
          appVersion: 'fixture',
          platform: process.platform,
          osRelease: 'fixture',
          arch: process.arch,
          electronVersion: 'fixture',
          chromeVersion: 'fixture',
          details: { fixture: 'safe synthetic data' }
        }
        return report
      })
    }
    ipcMain.removeHandler('gh:viewer')
    ipcMain.handle('gh:viewer', () => {
      record('viewer')
      return null
    })
  })
  const responses: unknown[] = []
  const call = async (reject = false) => {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('ORCA_'))
    )
    try {
      const { stdout } = await runViewerFixtureProcess({
        program: process.execPath,
        args: [
          path.join(process.cwd(), 'out/cli/index.js'),
          'ui',
          'crash-report',
          'open',
          '--viewer',
          'host',
          '--json'
        ],
        env: { ...env, ORCA_USER_DATA_PATH: manifest.userData, ORCA_BACKGROUND_LAUNCH: '1' },
        timeoutMs: 20000
      })
      expect(reject).toBe(false)
      const envelope = JSON.parse(stdout)
      responses.push(envelope)
      writeFileSync(testInfo.outputPath('cli-results.json'), JSON.stringify(responses, null, 2))
      return CrashReportResultSchema.parse(envelope.result)
    } catch (error) {
      if (error instanceof Error && 'stdout' in error) {
        writeFileSync(
          testInfo.outputPath('cli-failure.json'),
          JSON.stringify({ stdout: error.stdout, expected: reject }, null, 2)
        )
      }
      if (
        !reject ||
        !(error instanceof Error) ||
        !('stdout' in error) ||
        typeof error.stdout !== 'string'
      ) {
        throw error
      }
      expect(error.stdout).toContain('viewer_modal_already_open')
      responses.push({ rejected: true, stdout: error.stdout })
      writeFileSync(testInfo.outputPath('cli-results.json'), JSON.stringify(responses, null, 2))
      return null
    }
  }
  const dialog = orcaPage.locator('[role="dialog"][data-crash-report-dialog="true"]')
  const read = async (seed: 'empty' | 'report') => {
    await expect(dialog).toBeInViewport()
    await expect(dialog).toHaveAttribute('data-crash-report-open', 'true')
    await expect(dialog).toHaveAttribute('data-crash-report-source', 'help_menu')
    await expect(dialog).toHaveAttribute('data-crash-report-content-state', seed)
    const title = dialog.locator('[data-slot="dialog-title"]')
    const description = dialog.locator('[data-slot="dialog-description"]')
    await expect(title).toBeInViewport()
    await expect(description).toBeInViewport()
    await expect(dialog.locator('textarea[data-crash-report-notes]')).toHaveValue('')
    for (const kind of ['copy', 'dismiss', 'send']) {
      await expect(dialog.locator(`button[data-crash-report-action="${kind}"]`)).toBeInViewport()
    }
    const titleText = await title.textContent()
    const descriptionText = await description.textContent()
    expect(titleText?.trim()).toBeTruthy()
    expect(descriptionText?.trim()).toBeTruthy()
    return {
      titleText,
      descriptionText,
      epoch: Number(await dialog.getAttribute('data-crash-report-epoch'))
    }
  }
  const comparisons: unknown[] = []
  for (const seed of ['empty', 'report'] as const) {
    await electronApp.evaluate((_electron, value) => {
      process.env.ORCA_E2E_CRASH_VIEWER_SEED = value
    }, seed)
    await electronApp.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed())
      if (!window) {
        throw new Error('fixture window missing')
      }
      window.webContents.send('ui:openCrashReport')
    })
    const original = await read(seed)
    await dialog.screenshot({ path: testInfo.outputPath(`${seed}-original.png`) })
    expect(await call(true)).toBeNull()
    expect(await read(seed)).toEqual(original)
    await orcaPage.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    const result = await call()
    expect(result).toMatchObject({
      applied: true,
      dialogPresent: true,
      contentPresent: true,
      source: 'help_menu'
    })
    const cli = await read(seed)
    expect(cli.titleText).toBe(original.titleText)
    expect(cli.descriptionText).toBe(original.descriptionText)
    expect(cli.epoch).toBeGreaterThan(original.epoch)
    await dialog.screenshot({ path: testInfo.outputPath(`${seed}-cli.png`) })
    comparisons.push({
      seed,
      sameTitleAndDescription: true,
      controlsPresent: true,
      notesBlank: true,
      originalEpoch: original.epoch,
      cliEpoch: cli.epoch
    })
    await orcaPage.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  }
  await orcaPage.evaluate(() => {
    const node = document.createElement('div')
    node.setAttribute('role', 'alertdialog')
    node.dataset.crashReportBlockingFixture = 'true'
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
  const blocker = orcaPage.locator('[data-crash-report-blocking-fixture]')
  await expect(blocker).toBeInViewport()
  expect(await call(true)).toBeNull()
  await expect(blocker).toHaveText('Existing decision')
  await blocker.evaluate((node) => node.remove())
  const counts = await electronApp.evaluate(() =>
    JSON.parse(process.env.ORCA_E2E_CRASH_VIEWER_COUNTS ?? '{}')
  )
  expect(counts.getLatestReport).toBe(4)
  expect(counts.viewer).toBeGreaterThanOrEqual(4)
  for (const key of ['submit', 'copyLatestDiagnostics', 'dismiss']) {
    expect(counts[key] ?? 0).toBe(0)
  }
  writeFileSync(
    testInfo.outputPath('equivalence.json'),
    JSON.stringify(
      {
        comparisons,
        counts,
        originalDispatch: 'existing ui:openCrashReport IPC handler',
        originalNativeMenu: false,
        independentAlertDialogRefused: true,
        provider: 'isolated synthetic IPC seam',
        serviceReadOrSubmissionAck: false
      },
      null,
      2
    )
  )
  await hidden()
})
