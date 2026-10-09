import { runViewerFixtureProcess } from './helpers/viewer-fixture-process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect } from './helpers/orca-app'
import { FeatureTipViewerResultSchema } from '../../src/shared/feature-tip-viewer-command'
import { FEATURE_TIP_IDS, type FeatureTipId } from '../../src/shared/feature-tips'

test('feature tip CLI reads the open tip and skips it through the dialog action', async ({
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
        'feature-tip',
        ...args,
        '--viewer',
        'host',
        '--json'
      ],
      env: { ...env, ORCA_USER_DATA_PATH: userData, ORCA_BACKGROUND_LAUNCH: '1' },
      timeoutMs: 20000
    })
    const envelope = JSON.parse(stdout)
    results.push(envelope)
    writeFileSync(testInfo.outputPath('cli-results.json'), JSON.stringify(results, null, 2))
    expect(envelope._meta.runtimeId).toBeTruthy()
    return FeatureTipViewerResultSchema.parse(envelope.result)
  }
  const refused = (args: string[], reason: string) =>
    expect(call(args)).rejects.toMatchObject({ stdout: expect.stringContaining(reason) })
  const windowsHidden = () =>
    electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().every((window) => !window.isVisible() && !window.isFocused())
    )
  const dialog = orcaPage.locator('[role="dialog"]')
  const storeSeen = () => orcaPage.evaluate(() => window.__store?.getState().featureTipsSeenIds)
  const hostSeen = () =>
    orcaPage.evaluate(async () => (await window.api.ui.get()).featureTipsSeenIds)
  // Leave only the tip under test unseen so a skip has a write to make and no other pending tip is prompted.
  const seenBefore = (tipId: FeatureTipId) => FEATURE_TIP_IDS.filter((id) => id !== tipId)
  const seenAfter = (tipId: FeatureTipId) => [...seenBefore(tipId), tipId]
  // The app records a tip as seen when it shows one on its own, so also open one that is already recorded.
  const openTip = async (tipId: FeatureTipId, alreadySeen = false) => {
    await orcaPage.evaluate(
      async ({ id, seen }) => {
        await window.api.ui.set({ featureTipsSeenIds: seen })
        window.__store?.setState({ featureTipsSeenIds: seen })
        window.__store?.getState().openModal('feature-tips', { tipId: id })
      },
      { id: tipId, seen: alreadySeen ? [...FEATURE_TIP_IDS] : seenBefore(tipId) }
    )
    await expect(dialog).toBeVisible()
  }
  expect(await windowsHidden()).toBe(true)

  // No tip showing: a read says so and a skip is refused without changing anything.
  expect(await call(['get'])).toMatchObject({
    dispatched: false,
    applied: true,
    persisted: null,
    tipId: null,
    open: false,
    rendered: { open: false, tipId: null }
  })
  await refused(['skip'], 'feature_tip_unavailable')

  // The dialog's own dismissal records the tip as seen and closes it: the reference state.
  await openTip('cmd-j-palette')
  expect(await call(['get'])).toMatchObject({
    tipId: 'cmd-j-palette',
    open: true,
    rendered: { open: true, tipId: 'cmd-j-palette', action: 'learn-cmd-j-palette' }
  })
  await orcaPage.screenshot({ path: testInfo.outputPath('tip-open.png') })
  await orcaPage.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect.poll(storeSeen).toEqual(seenAfter('cmd-j-palette'))
  await expect.poll(hostSeen).toEqual(seenAfter('cmd-j-palette'))

  // The CLI skip reaches the same state, and refuses a tip it was not asked about first.
  await openTip('orca-cli')
  await refused(['skip', '--tip', 'cmd-j-palette'], 'feature_tip_mismatch')
  await expect(dialog).toBeVisible()
  expect(await storeSeen()).toEqual(seenBefore('orca-cli'))
  const skipped = await call(['skip', '--tip', 'orca-cli'])
  expect(skipped).toMatchObject({
    dispatched: true,
    applied: true,
    persisted: true,
    writeOutcome: 'unknown',
    tipId: 'orca-cli',
    open: false,
    rendered: { open: false, tipId: null }
  })
  expect(skipped).not.toHaveProperty('reason')
  await expect(dialog).toHaveCount(0)
  expect(await storeSeen()).toEqual(seenAfter('orca-cli'))
  expect(await hostSeen()).toEqual(seenAfter('orca-cli'))
  await refused(['skip'], 'feature_tip_unavailable')
  await orcaPage.screenshot({ path: testInfo.outputPath('tip-skipped.png') })

  // A tip the app opened itself is already recorded: the skip closes it and the host list stays complete.
  await openTip('cmd-j-palette', true)
  expect(await call(['skip'])).toMatchObject({
    dispatched: true,
    applied: true,
    persisted: true,
    tipId: 'cmd-j-palette',
    open: false
  })
  await expect(dialog).toHaveCount(0)
  expect(await hostSeen()).toEqual([...FEATURE_TIP_IDS])
  expect(await windowsHidden()).toBe(true)
})
