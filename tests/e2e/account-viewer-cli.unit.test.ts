import { afterEach, expect, it, vi } from 'vitest'
import { parseArgs, validateCommandAndFlags } from '../../src/cli/args'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { ACCOUNT_VIEWER_COMMAND_SPECS } from '../../src/cli/specs/account-viewer'
import { ACCOUNT_VIEWER_HANDLERS } from '../../src/cli/handlers/account-viewer'
import { AccountsViewerParams } from '../../src/shared/rpc-contract/accounts-viewer-params'
import { applyAccountsViewerAction } from '../../src/renderer/src/runtime/accounts-viewer-actions'
import { useAppStore } from '../../src/renderer/src/store'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('applies a parsed account navigation command to the existing renderer store', async () => {
  const client = new RuntimeClient('/unused-fixture', 100, null, null, 'orca')
  const call = vi.spyOn(client, 'call').mockImplementation(async (method, input) => {
    expect(method).toBe('accounts.viewerAction')
    const params = AccountsViewerParams.parse(input)
    return {
      id: 'fixture',
      ok: true,
      result: await applyAccountsViewerAction(params.action),
      _meta: { runtimeId: 'fixture' }
    }
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const run = async (argv: string[]) => {
    const parsed = parseArgs(
      argv,
      ACCOUNT_VIEWER_COMMAND_SPECS.map((spec) => spec.path),
      ACCOUNT_VIEWER_COMMAND_SPECS
    )
    validateCommandAndFlags(ACCOUNT_VIEWER_COMMAND_SPECS, parsed)
    const handler = ACCOUNT_VIEWER_HANDLERS[parsed.commandPath.join(' ')]
    if (!handler) {
      throw new Error('missing_handler')
    }
    await handler({ client, flags: parsed.flags, cwd: '/fixture', json: true })
  }
  useAppStore.setState({ activeView: 'terminal', settingsNavigationTarget: null })
  await run(['account-view', 'open-settings', '--viewer', 'desktop', '--pane', 'accounts'])
  expect(useAppStore.getState().settingsNavigationTarget).toEqual({
    pane: 'accounts',
    repoId: null
  })
  expect(useAppStore.getState().activeView).toBe('settings')
  await expect(
    run([
      'account-view',
      'queue-codex-restarts',
      '--viewer',
      'desktop',
      '--pty-ids',
      'fixture-pane'
    ])
  ).rejects.toThrow()
  expect(call).toHaveBeenCalledTimes(1)
  await expect(
    run(['account-view', 'open-settings', '--viewer', 'other', '--pane', 'accounts'])
  ).rejects.toThrow()
  expect(call).toHaveBeenCalledTimes(1)
})

it('opens only fixed documentation with explicit viewer and confirmation', async () => {
  const openUrl = vi.fn(async () => undefined)
  vi.stubGlobal('window', { api: { shell: { openUrl } } })
  const client = new RuntimeClient('/unused-fixture', 100, null, null, 'orca')
  const call = vi.spyOn(client, 'call').mockImplementation(async (_method, input) => {
    const params = AccountsViewerParams.parse(input)
    return {
      id: 'fixture',
      ok: true,
      result: await applyAccountsViewerAction(params.action),
      _meta: { runtimeId: 'fixture' }
    }
  })
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  const handler = ACCOUNT_VIEWER_HANDLERS['account-view open-bitbucket-docs']
  await expect(
    handler({ client, flags: new Map([['viewer', 'desktop']]), cwd: '/fixture', json: true })
  ).rejects.toThrow()
  expect(call).not.toHaveBeenCalled()
  await handler({
    client,
    flags: new Map([
      ['viewer', 'desktop'],
      ['confirm', 'true']
    ]),
    cwd: '/fixture',
    json: true
  })
  expect(openUrl).toHaveBeenCalledWith(
    'https://support.atlassian.com/bitbucket-cloud/docs/using-api-tokens/'
  )
  expect(JSON.parse(output.mock.calls[0][0])).toMatchObject({ result: { opened: true } })
  vi.unstubAllGlobals()
})
