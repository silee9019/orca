import { runViewerFixtureProcess } from './helpers/viewer-fixture-process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect } from './helpers/orca-app'
import { StatusBarViewerResultSchema } from '../../src/shared/status-bar-viewer-command'

test('status bar CLI acknowledges parent effects and actual visibility', async ({
  orcaPage,
  electronApp
}, testInfo) => {
  const userData = await electronApp.evaluate(({ app }) => app.getPath('userData'))
  const pid = await electronApp.evaluate(() => process.pid)
  writeFileSync(
    testInfo.outputPath('process-manifest.json'),
    JSON.stringify({ pid, userData, backgroundLaunch: process.env.ORCA_BACKGROUND_LAUNCH }, null, 2)
  )
  if (process.platform === 'darwin') {
    const { stdout: processState } = await runViewerFixtureProcess({
      program: 'ps',
      args: ['-p', String(pid), '-o', 'pid=,ppid=,ni=,comm=']
    })
    const { stdout: listeners } = await runViewerFixtureProcess({
      program: 'lsof',
      args: ['-nP', '-a', '-p', String(pid), '-iTCP', '-sTCP:LISTEN']
    })
    writeFileSync(testInfo.outputPath('process-isolation.txt'), `${processState}\n${listeners}`)
  }
  const results: unknown[] = []
  const call = async (args: string[]) => {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('ORCA_'))
    )
    const { stdout } = await runViewerFixtureProcess({
      program: process.execPath,
      args: [
        path.join(process.cwd(), 'out', 'cli', 'index.js'),
        'ui',
        ...args,
        '--viewer',
        'host',
        '--json'
      ],
      env: { ...env, ORCA_USER_DATA_PATH: userData, ORCA_BACKGROUND_LAUNCH: '1' },
      timeoutMs: 20000
    }).catch((error: unknown) => {
      if (typeof error === 'object' && error !== null && 'stdout' in error) {
        writeFileSync(
          testInfo.outputPath('cli-error.json'),
          JSON.stringify({ stdout: error.stdout })
        )
      }
      throw error
    })
    const envelope = JSON.parse(stdout)
    results.push(envelope)
    writeFileSync(testInfo.outputPath('cli-results.json'), JSON.stringify(results, null, 2))
    expect(envelope._meta.runtimeId).toBeTruthy()
    return StatusBarViewerResultSchema.parse(envelope.result)
  }
  expect(
    await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().every((window) => !window.isVisible() && !window.isFocused())
    )
  ).toBe(true)
  const initial = await call(['status-bar', 'get'])
  expect(initial.visible).toBe(true)
  expect(initial.rendered).not.toBeNull()
  await orcaPage
    .locator('[data-status-bar-viewer]')
    .screenshot({ path: testInfo.outputPath('before.png') })
  const hidden = await call(['status-bar', 'toggle'])
  expect(hidden).toMatchObject({ visible: false, applied: true, persisted: true, rendered: null })
  await expect(orcaPage.locator('[data-status-bar-viewer]')).toHaveCount(0)
  const shown = await call(['status-bar', 'toggle'])
  expect(shown).toMatchObject({ visible: true, applied: true, persisted: true })
  for (const [index, enabled] of ['false', 'false', 'true'].entries()) {
    const result = await call(['status-bar', 'item', '--item', 'ports', '--enabled', enabled])
    expect(result).toMatchObject({ applied: true, persisted: true })
    expect(result.items.includes('ports')).toBe(enabled === 'true')
    expect(result.interactionRecorded).toBe(
      index === 0 ? initial.items.includes('ports') : index === 2
    )
  }
  await orcaPage.evaluate(() => {
    const store = window.__store
    if (!store) {
      throw new Error('missing_store')
    }
    store.setState({
      detectedAgentIds: ['gemini'],
      rateLimits: {
        ...store.getState().rateLimits,
        gemini: {
          provider: 'gemini',
          status: 'ok',
          updatedAt: Date.now(),
          error: null,
          session: { usedPercent: 25, windowMinutes: 300, resetsAt: null, resetDescription: null },
          weekly: null
        }
      }
    })
  })
  expect(await call(['status-bar', 'item', '--item', 'gemini', '--enabled', 'true'])).toMatchObject(
    { applied: true, persisted: true }
  )
  for (const display of ['remaining', 'used']) {
    const result = await call(['status-bar', 'percentage', '--display', display])
    expect(result).toMatchObject({
      applied: true,
      persisted: true,
      percentageDisplay: display,
      percentageNoticeDismissed: true
    })
    expect(result.rendered?.percentageDisplay).toBe(display)
    expect(result.rendered?.providers).toContain('gemini')
    await expect(orcaPage.locator('[data-usage-chip="gemini"]')).toContainText(
      display === 'remaining' ? '75%' : '25%'
    )
    await orcaPage
      .locator('[data-status-bar-viewer]')
      .screenshot({ path: testInfo.outputPath(`percentage-${display}.png`) })
  }
  await orcaPage
    .locator('[data-status-bar-viewer]')
    .screenshot({ path: testInfo.outputPath('after.png') })
  expect(
    await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().every((window) => !window.isVisible() && !window.isFocused())
    )
  ).toBe(true)
})
