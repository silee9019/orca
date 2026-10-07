import { afterEach, expect, it, vi } from 'vitest'
import { RuntimeClient, RuntimeRpcFailureError } from '../runtime-client'
import { SETTINGS_DETECTION_HANDLERS } from './settings-detection'

async function invoke(key: string, flags = new Map<string, string | boolean>()) {
  const handler = SETTINGS_DETECTION_HANDLERS[key]
  if (!handler) {
    throw new Error('Missing detection handler')
  }
  await handler({
    client: new RuntimeClient(undefined, 1000, null, null),
    flags,
    cwd: '.',
    json: true
  })
}
afterEach(() => vi.restoreAllMocks())

it('masks account identifiers and forwards the requested WSL distro', async () => {
  const call = vi.spyOn(RuntimeClient.prototype, 'call').mockResolvedValue({
    id: 'test',
    ok: true,
    _meta: { runtimeId: 'windows-host' },
    result: {
      git: { installed: true },
      gh: { installed: true, authenticated: true, account: 'account-canary' },
      gitea: {
        configured: true,
        authenticated: true,
        baseUrl: 'url-canary',
        tokenConfigured: true
      }
    }
  })
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  await invoke('settings preflight check', new Map([['wsl', 'FixtureLinux']]))
  expect(call).toHaveBeenCalledExactlyOnceWith('settings.control.preflightCheck', {
    wslDistro: 'FixtureLinux',
    wslDefault: false,
    force: false
  })
  expect(String(log.mock.calls[0]?.[0])).not.toContain('canary')
  expect(String(log.mock.calls[0]?.[0])).toContain('windows-host')
})

it('rejects conflicting WSL selectors and SSH/WSL combinations before connecting', async () => {
  const call = vi.spyOn(RuntimeClient.prototype, 'call')
  await expect(
    invoke(
      'settings agents detect',
      new Map<string, string | boolean>([
        ['wsl', 'FixtureLinux'],
        ['wsl-default', true]
      ])
    )
  ).rejects.toMatchObject({ code: 'invalid_argument' })
  await expect(
    invoke(
      'settings agents detect',
      new Map([
        ['host', 'ssh:fixture'],
        ['wsl', 'FixtureLinux']
      ])
    )
  ).rejects.toMatchObject({ code: 'invalid_argument' })
  expect(call).not.toHaveBeenCalled()
})

it('reports old-host incompatibility without falling back to a native probe', async () => {
  const call = vi.spyOn(RuntimeClient.prototype, 'call').mockRejectedValue(
    new RuntimeRpcFailureError({
      id: 'test',
      ok: false,
      _meta: { runtimeId: 'old' },
      error: { code: 'method_not_found', message: 'unknown' }
    })
  )
  await expect(
    invoke('settings agents detect', new Map([['wsl', 'FixtureLinux']]))
  ).rejects.toMatchObject({ code: 'update_required' })
  expect(call).toHaveBeenCalledTimes(1)
})

it('resolves an SSH label on the selected runtime and never probes locally', async () => {
  const call = vi
    .spyOn(RuntimeClient.prototype, 'call')
    .mockResolvedValueOnce({
      id: 'targets',
      ok: true,
      _meta: { runtimeId: 'host-fixture' },
      result: {
        targets: [{ id: 'ssh-fixture', label: 'Fixture', connected: true, remotePlatform: 'linux' }]
      }
    })
    .mockResolvedValueOnce({
      id: 'agents',
      ok: true,
      _meta: { runtimeId: 'host-fixture' },
      result: ['codex', 'future-agent']
    })
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  await invoke('settings agents detect', new Map([['host', 'ssh:Fixture']]))
  expect(call.mock.calls).toEqual([
    ['ssh.listTargetSummaries'],
    ['preflight.detectRemoteAgents', { connectionId: 'ssh-fixture' }]
  ])
  expect(JSON.parse(String(log.mock.calls[0]?.[0])).result).toEqual({
    host: 'ssh:Fixture',
    agents: ['codex', 'future-agent']
  })
})
