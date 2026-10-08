import { afterEach, expect, it, vi } from 'vitest'
import { RuntimeClient } from './runtime-client'
import { requireAccountsPermissionsExecutionHost } from './accounts-permissions-host-boundary'
import { ACCOUNT_HANDLERS } from './handlers/account'
import { ACCOUNT_CREDENTIAL_HANDLERS } from './handlers/account-credentials'
import { ACCOUNT_LOGIN_HANDLERS } from './handlers/account-login'
import { PROFILE_AUTH_HANDLERS } from './handlers/profile-auth'
import { ACCOUNT_PREFERENCE_HANDLERS } from './handlers/account-preference'
import { ACCOUNT_SECRET_SETTING_HANDLERS } from './handlers/account-secret-settings'
import { AGENT_PERMISSION_MODE_HANDLERS } from './handlers/agent-permission-mode'
import { ACCOUNT_MOUNTED_VIEWER_HANDLERS } from './handlers/account-mounted-viewer'
import { ANTIGRAVITY_ACCOUNT_HANDLERS } from './handlers/antigravity-accounts'
import { ACCOUNT_VIEWER_HANDLERS } from './handlers/account-viewer'
import { ACCOUNT_INSPECTION_HANDLERS } from './handlers/account-inspection'
import { OS_PERMISSION_HANDLERS } from './handlers/os-permissions'
import { RESOURCE_MANAGER_HANDLERS } from './handlers/resource-manager'
import { CODEX_ACCOUNT_OBSERVE_HANDLERS } from './handlers/codex-account-observe'
import { TCC_THRESHOLD_OBSERVE_HANDLERS } from './handlers/tcc-threshold-observe'
import { USAGE_HANDLERS } from './handlers/usage'
const platform = Object.getOwnPropertyDescriptor(process, 'platform')
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  if (platform) {
    Object.defineProperty(process, 'platform', platform)
  }
})
const handlers = {
  ...ACCOUNT_HANDLERS,
  ...ACCOUNT_CREDENTIAL_HANDLERS,
  ...ACCOUNT_LOGIN_HANDLERS,
  ...PROFILE_AUTH_HANDLERS,
  ...ACCOUNT_PREFERENCE_HANDLERS,
  ...ACCOUNT_SECRET_SETTING_HANDLERS,
  ...AGENT_PERMISSION_MODE_HANDLERS,
  ...ACCOUNT_MOUNTED_VIEWER_HANDLERS,
  ...ANTIGRAVITY_ACCOUNT_HANDLERS,
  ...ACCOUNT_VIEWER_HANDLERS,
  ...ACCOUNT_INSPECTION_HANDLERS,
  ...OS_PERMISSION_HANDLERS,
  ...RESOURCE_MANAGER_HANDLERS,
  ...CODEX_ACCOUNT_OBSERVE_HANDLERS,
  ...TCC_THRESHOLD_OBSERVE_HANDLERS,
  ...USAGE_HANDLERS
}
it.each(Object.entries(handlers))(
  'rejects SSH-forwarded local %s before reading files or calling RPC',
  async (_, handler) => {
    vi.stubEnv('ORCA_CLI_CWD', '/remote/fixture')
    vi.stubEnv('ORCA_CLI_WSL_DISTRO', '')
    const client = new RuntimeClient('/fixture', 100, null, null, 'orca')
    const call = vi.spyOn(client, 'call').mockRejectedValue(new Error('Unexpected fixture RPC'))
    await expect(
      Promise.resolve().then(() =>
        handler({
          client,
          cwd: '/remote/fixture',
          flags: new Map([['input-file', '/missing/private-file']]),
          json: true
        })
      )
    ).rejects.toThrow('execution host')
    expect(call).not.toHaveBeenCalled()
  }
)
it.each(['browser', 'page', 'server'])('rejects unsupported --%s before any RPC', (flag) => {
  vi.stubEnv('ORCA_CLI_CWD', '')
  const client = new RuntimeClient('/fixture', 100, null, null, 'orca')
  expect(() =>
    requireAccountsPermissionsExecutionHost({
      client,
      cwd: '/fixture',
      flags: new Map([[flag, 'fixture']]),
      json: true
    })
  ).toThrow('selectors')
})
it.each(['distro-env', 'unc'])(
  'accepts a proven Win32 WSL bridge %s and preserves login target',
  async (source) => {
    Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' })
    vi.stubEnv('ORCA_CLI_CWD', '/mnt/c/fixture')
    vi.stubEnv('ORCA_CLI_WSL_DISTRO', source === 'distro-env' ? 'FixtureWSL' : '')
    const client = new RuntimeClient('/fixture', 100, null, null, 'orca')
    const call = vi.spyOn(client, 'call').mockResolvedValue({
      id: 'fixture',
      ok: true,
      result: { state: 'pending' },
      _meta: { runtimeId: 'fixture' }
    })
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    await ACCOUNT_LOGIN_HANDLERS['account login start']({
      client,
      cwd: source === 'unc' ? '\\\\wsl.localhost\\FixtureWSL\\home\\fixture' : 'C:\\fixture',
      flags: new Map([['agent', 'claude']]),
      json: true
    })
    expect(call).toHaveBeenCalledExactlyOnceWith('accounts.loginStart', {
      provider: 'claude',
      target: { runtime: 'wsl', wslDistro: 'FixtureWSL' }
    })
  }
)
it('accepts an explicit paired remote runtime while keeping pinned selector policy', async () => {
  vi.stubEnv('ORCA_CLI_CWD', '/remote/fixture')
  const client = new RuntimeClient('/fixture', 100, null, null, 'orca')
  vi.spyOn(client, 'isRemote', 'get').mockReturnValue(true)
  const context = {
    client,
    cwd: '/remote/fixture',
    flags: new Map<string, string | boolean>(),
    json: true
  }
  expect(() => requireAccountsPermissionsExecutionHost(context)).not.toThrow()
  const call = vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    result: { apiKeyConfigured: false },
    _meta: { runtimeId: 'fixture' }
  })
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  context.flags.set('provider', 'opencode-go')
  await ACCOUNT_CREDENTIAL_HANDLERS['credentials status'](context)
  expect(call).toHaveBeenCalledExactlyOnceWith('accountCredentials.status', {
    provider: 'opencode-go'
  })
  context.flags.set('environment', 'explicit-host')
  await expect(ACCOUNT_CREDENTIAL_HANDLERS['credentials status'](context)).rejects.toThrow(
    'does not retarget'
  )
  expect(call).toHaveBeenCalledTimes(1)
})
