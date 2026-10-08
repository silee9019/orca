import { expect, it, vi } from 'vitest'
import { signInCodexAccount } from './codex-sign-in-action'
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/codex-session-restart', () => ({
  markLiveCodexSessionsForRestart: vi.fn(),
  resolveCodexRestartPromptAccountLabel: vi.fn()
}))
it('returns false for swallowed sign-in failure and true only after the existing flow finishes', async () => {
  const state = { accounts: [], activeAccountId: null }
  const reauthenticate = vi.fn(async () => state)
  Object.assign(globalThis, { window: { api: { codexAccounts: { reauthenticate } } } })
  const dependencies = {
    accountState: state,
    accountsExpandedRef: { current: false },
    fetchInactiveCodexAccountUsage: vi.fn(async () => {}),
    fetchSettings: vi.fn(async () => {}),
    isSwitching: false,
    mountedRef: { current: true },
    reauthenticatingAccountId: null,
    recordFeatureInteraction: vi.fn(async () => {}),
    setAccounts: vi.fn(),
    setAccountsExpanded: vi.fn(),
    setReauthenticatingAccountId: vi.fn()
  }
  const target = { runtime: 'host' as const, wslDistro: null }
  expect(await signInCodexAccount('fixture-account', target, dependencies)).toBe(true)
  expect(dependencies.fetchSettings).toHaveBeenCalledOnce()
  expect(dependencies.setReauthenticatingAccountId).toHaveBeenLastCalledWith(null)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  reauthenticate.mockRejectedValueOnce(new Error('fixture-failure'))
  expect(await signInCodexAccount('fixture-account', target, dependencies)).toBe(false)
  expect(
    await signInCodexAccount('fixture-account', target, { ...dependencies, isSwitching: true })
  ).toBe(false)
})
