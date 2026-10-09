import { runViewerFixtureProcess } from './helpers/viewer-fixture-process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect } from './helpers/orca-app'
import { OrcaYamlTrustViewerResultSchema } from '../../src/shared/orca-yaml-trust-viewer-command'

test('orca.yaml trust CLI reads the open prompt and declines it through the dialog handler', async ({
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
        'orca-yaml-trust',
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
    return OrcaYamlTrustViewerResultSchema.parse(envelope.result)
  }
  const refused = (args: string[], reason: string) =>
    expect(call(args)).rejects.toMatchObject({ stdout: expect.stringContaining(reason) })
  const windowsHidden = () =>
    electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().every((window) => !window.isVisible() && !window.isFocused())
    )
  const dialog = orcaPage.locator('[role="dialog"]')
  const trustedHooks = () =>
    orcaPage.evaluate(async () => ({
      store: window.__store?.getState().trustedOrcaHooks,
      host: (await window.api.ui.get()).trustedOrcaHooks
    }))
  const decision = () => orcaPage.evaluate(() => localStorage.getItem('e2e-trust-decision'))
  const prompt = {
    repoId: 'e2e-repo',
    repoName: 'orca',
    scriptKind: 'setup',
    previouslyApproved: false,
    contentHash: 'hash-1'
  }
  // The caller's decision is recorded where the test can read it; the script text must never reach the CLI.
  const openPrompt = async () => {
    await orcaPage.evaluate((data) => {
      localStorage.removeItem('e2e-trust-decision')
      window.__store?.getState().openModal('confirm-orca-yaml-hooks', {
        ...data,
        scriptContent: 'echo SECRET_SCRIPT_TEXT',
        onResolve: (value: string) => localStorage.setItem('e2e-trust-decision', value)
      })
    }, prompt)
    await expect(dialog).toBeVisible()
  }
  expect(await windowsHidden()).toBe(true)
  const untouched = await trustedHooks()

  // No prompt showing: a read says so and a skip is refused without changing anything.
  expect(await call(['get'])).toMatchObject({
    dispatched: false,
    applied: true,
    prompt: null,
    open: false,
    rendered: { open: false, prompt: null }
  })
  await refused(['skip'], 'orca_yaml_trust_unavailable')

  // The dialog's own dismissal declines the script and trusts nothing: the reference state.
  await openPrompt()
  const read = await call(['get'])
  expect(read).toMatchObject({ prompt, open: true, rendered: { open: true, prompt } })
  expect(JSON.stringify(results)).not.toContain('SECRET_SCRIPT_TEXT')
  await orcaPage.screenshot({ path: testInfo.outputPath('trust-open.png') })
  await orcaPage.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  expect(await decision()).toBe('skip')
  expect(await trustedHooks()).toEqual(untouched)

  // The CLI reaches the same state, even with "Always trust" checked, and refuses a prompt it was not asked about.
  await openPrompt()
  await refused(['skip', '--repo', 'other-repo'], 'orca_yaml_trust_mismatch')
  await refused(['skip', '--script-kind', 'archive'], 'orca_yaml_trust_mismatch')
  await expect(dialog).toBeVisible()
  expect(await decision()).toBeNull()
  await dialog.getByRole('checkbox').check()
  const skipped = await call(['skip', '--repo', 'e2e-repo', '--script-kind', 'setup'])
  expect(skipped).toMatchObject({
    dispatched: true,
    applied: true,
    writeOutcome: 'not_requested',
    decision: 'skip',
    prompt,
    open: false,
    rendered: { open: false, prompt: null }
  })
  expect(skipped).not.toHaveProperty('reason')
  await expect(dialog).toHaveCount(0)
  expect(await decision()).toBe('skip')
  expect(await trustedHooks()).toEqual(untouched)
  expect(JSON.stringify(results)).not.toContain('SECRET_SCRIPT_TEXT')
  await refused(['skip'], 'orca_yaml_trust_unavailable')
  await orcaPage.screenshot({ path: testInfo.outputPath('trust-skipped.png') })
  expect(await windowsHidden()).toBe(true)
})
