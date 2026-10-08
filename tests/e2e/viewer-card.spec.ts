import { runViewerFixtureProcess } from './helpers/viewer-fixture-process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect } from './helpers/orca-app'
import { CardViewerResultSchema } from '../../src/shared/card-viewer-command'
import { normalizeWorktreeCardProperties } from '../../src/shared/worktree/card-properties'

test('card CLI acknowledges presets and rendered configuration', async ({
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
        path.join(process.cwd(), 'out/cli/index.js'),
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
    return CardViewerResultSchema.parse(envelope.result)
  }
  expect(
    await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().every((window) => !window.isVisible() && !window.isFocused())
    )
  ).toBe(true)
  await orcaPage
    .locator('[data-sidebar-resize-handle]')
    .locator('..')
    .screenshot({ path: testInfo.outputPath('before.png') })
  const initial = await call(['card', 'get'])
  expect(initial.rendered.length).toBeGreaterThan(0)
  await orcaPage.evaluate(() =>
    window.__store?.getState().updateSettingsOrThrow({ experimentalNewWorktreeCardStyle: true })
  )
  for (const mode of ['Compact', 'Default']) {
    const result = await call(['card', 'mode', '--mode', mode])
    expect(result).toMatchObject({
      applied: true,
      persisted: true,
      compact: mode === 'Compact',
      defaulted: true
    })
    expect(result.rendered.length).toBeGreaterThan(0)
    await orcaPage
      .locator('[data-viewer-sidebar="left"]')
      .screenshot({ path: testInfo.outputPath(`card-new-${mode}.png`) })
    for (const card of result.rendered) {
      expect(card.compact).toBe(card.newStyle ? false : mode === 'Compact')
      expect(normalizeWorktreeCardProperties(card.properties)).toEqual(result.properties)
    }
  }
  await expect(call(['card', 'activity', '--mode', 'full'])).rejects.toThrow()
  await orcaPage.evaluate(() =>
    window.__store?.getState().updateSettingsOrThrow({ experimentalNewWorktreeCardStyle: false })
  )
  for (const mode of ['Compact', 'Default']) {
    const result = await call(['card', 'mode', '--mode', mode])
    expect(result).toMatchObject({ applied: true, persisted: true })
    expect(
      result.rendered.every((card) => !card.newStyle && card.compact === (mode === 'Compact'))
    ).toBe(true)
    await orcaPage
      .locator('[data-viewer-sidebar="left"]')
      .screenshot({ path: testInfo.outputPath(`card-legacy-${mode}.png`) })
  }
  for (const mode of ['full', 'compact']) {
    expect(await call(['card', 'activity', '--mode', mode])).toMatchObject({
      applied: true,
      persisted: true,
      activityMode: mode
    })
  }
  await orcaPage
    .locator('[data-viewer-sidebar="left"]')
    .screenshot({ path: testInfo.outputPath('card-preset.png') })
  await orcaPage.evaluate(() => window.__store?.getState().setSidebarOpen(false))
  await expect(orcaPage.locator('[data-viewer-sidebar="left"]')).toBeHidden()
  expect(await call(['card', 'mode', '--mode', 'Compact'])).toMatchObject({
    applied: false,
    persisted: true,
    reason: 'card_surface_unavailable'
  })
  await orcaPage.evaluate(() => window.__store?.getState().setSidebarOpen(true))
  expect(
    await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().every((window) => !window.isVisible() && !window.isFocused())
    )
  ).toBe(true)
})
