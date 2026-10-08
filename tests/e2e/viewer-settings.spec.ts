import { execFile } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { test, expect } from './helpers/orca-app'
import { SettingsViewerResultSchema } from '../../src/shared/settings-viewer-command'

test('settings CLI opens the actual pane and waits for rendered search results', async ({
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
    const { stdout: processState } = await promisify(execFile)('ps', [
      '-p',
      String(pid),
      '-o',
      'pid=,ppid=,ni=,comm='
    ])
    const { stdout: listeners } = await promisify(execFile)('lsof', [
      '-nP',
      '-a',
      '-p',
      String(pid),
      '-iTCP',
      '-sTCP:LISTEN'
    ])
    writeFileSync(testInfo.outputPath('process-isolation.txt'), `${processState}\n${listeners}`)
  }
  const results: unknown[] = []
  const call = async (args: string[]) => {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('ORCA_'))
    )
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        path.join(process.cwd(), 'out/cli/index.js'),
        'ui',
        'settings',
        ...args,
        '--viewer',
        'host',
        '--json'
      ],
      {
        env: { ...env, ORCA_USER_DATA_PATH: userData, ORCA_BACKGROUND_LAUNCH: '1' },
        timeout: 20000
      }
    ).catch((error: unknown) => {
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
    return SettingsViewerResultSchema.parse(envelope.result)
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
  const opened = await call(['open', '--pane', 'appearance'])
  expect(opened).toMatchObject({
    applied: true,
    resolvedSectionId: 'appearance',
    activeSectionId: 'appearance',
    sectionTargetPresent: true
  })
  await expect(
    orcaPage.locator('.settings-view-shell [data-settings-section="appearance"]')
  ).toBeVisible()
  await orcaPage
    .locator('.settings-view-shell')
    .screenshot({ path: testInfo.outputPath('appearance.png') })
  expect(
    await call(['open', '--pane', 'appearance', '--section', 'appearance-section-window'])
  ).toMatchObject({ applied: true, sectionTargetPresent: true })
  const search = await call(['search', '--query', 'terminal'])
  expect(search).toMatchObject({ applied: true, queryInput: 'terminal', queryApplied: 'terminal' })
  expect(search.visibleSectionIds).toContain('terminal')
  await orcaPage
    .locator('.settings-view-shell')
    .screenshot({ path: testInfo.outputPath('search.png') })
  expect(await call(['search', '--query', 'terminal'])).toMatchObject({
    applied: true,
    queryInput: 'terminal',
    queryApplied: 'terminal'
  })
  const empty = await call(['search', '--query', 'no-settings-match-this-query'])
  expect(empty).toMatchObject({ applied: true, visibleSectionIds: [] })
  expect((await call(['search', '--query', ''])).visibleSectionIds).toContain('general')
  const repoId = await orcaPage.evaluate(() => window.__store?.getState().repos[0]?.id)
  if (!repoId) {
    throw new Error('fixture_project_unavailable')
  }
  const repo = await call(['open', '--pane', 'repo', '--repo', repoId])
  expect(repo.applied).toBe(true)
  expect(repo.activeSectionId).toBe(repo.resolvedSectionId)
  expect(repo.renderedSectionIds).toContain(repo.resolvedSectionId)
  expect(
    await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().every((window) => !window.isVisible() && !window.isFocused())
    )
  ).toBe(true)
})
