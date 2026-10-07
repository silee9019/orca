import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../shared/constants'
import { AccountInspectionController } from './account-inspection-controller'
import { _internals, recordCodexPaneAccount } from '../codex/codex-pane-account-registry'

vi.mock('../cursor-accounts/status', () => ({
  getCursorAccountStatus: async () => ({ signedIn: false, error: 'fixture-secret-must-not-print' })
}))
vi.mock('../grok-accounts/status', () => ({
  getGrokAccountStatus: () => ({ signedIn: false, error: 'fixture-secret-must-not-print' })
}))
let directory: string
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'orca-account-inspection-'))
  vi.stubEnv('ORCA_USER_DATA_PATH', directory)
  _internals.resetCache()
})
afterEach(() => {
  _internals.resetCache()
  vi.unstubAllEnvs()
  rmSync(directory, { recursive: true, force: true })
})

it('reads and forgets only named Codex pane records on their original host and WSL lanes', async () => {
  const settings = getDefaultSettings(directory)
  settings.activeCodexManagedAccountIdsByRuntime = { host: 'new-host', wsl: { Ubuntu: 'old-wsl' } }
  recordCodexPaneAccount('host-pane', { selectionKey: 'host', accountId: 'old-host' })
  recordCodexPaneAccount('wsl-pane', { selectionKey: 'wsl:Ubuntu', accountId: 'old-wsl' })
  const controller = new AccountInspectionController(() => settings, {
    getMirroredHostHomePathForStatus: () => ({ kind: 'ready', homePath: null })
  })
  expect(
    await controller.inspect({ action: 'codex-recorded-lanes', ptyIds: ['host-pane', 'wsl-pane'] })
  ).toEqual({ 'host-pane': 'host', 'wsl-pane': 'wsl:Ubuntu' })
  expect(
    await controller.inspect({ action: 'codex-stale-panes', ptyIds: ['host-pane', 'wsl-pane'] })
  ).toEqual([{ ptyId: 'host-pane', launchAccountId: 'old-host', activeAccountId: 'new-host' }])
  await controller.inspect({ action: 'codex-forget-panes', ptyIds: ['host-pane'], confirm: true })
  _internals.resetCache()
  expect(
    JSON.parse(readFileSync(join(directory, 'codex-pane-accounts.json'), 'utf8')).panes
  ).toEqual({ 'wsl-pane': { selectionKey: 'wsl:Ubuntu', accountId: 'old-wsl' } })
})

it('does not expose provider credential parser errors', async () => {
  const controller = new AccountInspectionController(() => getDefaultSettings(directory), {
    getMirroredHostHomePathForStatus: () => ({ kind: 'unavailable' })
  })
  for (const action of ['cursor-status', 'grok-status'] as const) {
    expect(JSON.stringify(await controller.inspect({ action }))).not.toContain('fixture-secret')
  }
  expect(await controller.inspect({ action: 'codex-sync-status' })).toMatchObject({
    state: 'stalled',
    reason: 'managed-home-unavailable'
  })
})
