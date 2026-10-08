import { runViewerFixtureProcess } from './helpers/viewer-fixture-process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect } from './helpers/orca-app'
import { SidebarViewerResultSchema } from '../../src/shared/sidebar-viewer-command'

test('sidebar CLI uses existing guards and acknowledges actual panels', async ({
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
    return SidebarViewerResultSchema.parse(envelope.result)
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
  const initial = await call(['sidebar', 'get'])
  expect(initial.rendered.availablePanels).not.toContain('ports')
  expect(await call(['sidebar', 'toggle', '--side', 'left'])).toMatchObject({
    applied: true,
    sidebarOpen: false,
    rendered: { leftVisible: false }
  })
  await expect(orcaPage.locator('[data-viewer-sidebar="left"]')).toBeHidden()
  expect(await call(['sidebar', 'toggle', '--side', 'left'])).toMatchObject({
    applied: true,
    sidebarOpen: true,
    rendered: { leftVisible: true }
  })
  for (const panel of ['files', 'search', 'checks', 'source-control']) {
    const opened = await call(['panel', 'open', '--panel', panel])
    expect(opened.applied).toBe(true)
    expect(opened.rendered.panelReady).toBe(true)
    expect(opened.rendered.panel).toBe(panel === 'files' || panel === 'search' ? 'explorer' : panel)
    if (panel === 'files' || panel === 'search') {
      expect(opened.rendered.explorerView).toBe(panel)
    }
  }
  await orcaPage
    .locator('[data-viewer-sidebar="right"]')
    .screenshot({ path: testInfo.outputPath('right-panel.png') })
  await expect(call(['panel', 'open', '--panel', 'ports'])).rejects.toThrow()
  const beforeGuard = await call(['sidebar', 'get'])
  await orcaPage.evaluate(() => {
    const marker = document.createElement('div')
    marker.dataset.terminalSearchRoot = ''
    marker.id = 'cli-fixture-terminal-search'
    document.body.append(marker)
  })
  await expect(call(['panel', 'open', '--panel', 'source-control'])).rejects.toThrow()
  await orcaPage.evaluate(() => document.getElementById('cli-fixture-terminal-search')?.remove())
  expect((await call(['sidebar', 'get'])).rightSidebarTab).toBe(beforeGuard.rightSidebarTab)
  expect(await call(['sidebar', 'toggle', '--side', 'right'])).toMatchObject({
    applied: true,
    rightSidebarOpen: false,
    rendered: { rightVisible: false }
  })
  expect(await call(['sidebar', 'toggle', '--side', 'right'])).toMatchObject({
    applied: true,
    rightSidebarOpen: true,
    rendered: { rightVisible: true }
  })
  await orcaPage.evaluate(() => window.__store?.getState().openSettingsPage())
  await expect(orcaPage.locator('.settings-view-shell')).toBeVisible()
  await expect(call(['panel', 'open', '--panel', 'files'])).rejects.toThrow()
  await orcaPage.evaluate(() => window.__store?.getState().closeSettingsPage())
  expect(
    await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().every((window) => !window.isVisible() && !window.isFocused())
    )
  ).toBe(true)
})
