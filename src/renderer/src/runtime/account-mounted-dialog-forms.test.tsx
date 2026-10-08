// @vitest-environment happy-dom
import { useState } from 'react'
import { renderAccountsRemovalDialogs } from '../components/settings/accounts-pane-removal-dialogs'
import type {
  AccountsPaneSectionModel,
  RemoveAccountTarget
} from '../components/settings/accounts-pane-types'
import { useMountedProviderRemovalDialogControls } from './use-mounted-account-dialog-controls'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ManagedDataAccountsSection } from '../components/settings/ManagedDataAccountsSection'
import { OrcaAccountSettingsPane } from '../components/settings/OrcaAccountSettingsPane'
import { applyMountedAccountsViewerAction } from './account-mounted-viewer-actions'
const fixture = vi.hoisted(() => ({ signOut: vi.fn(), rpc: vi.fn() }))
vi.mock('./runtime-rpc-client', () => ({ callRuntimeRpc: fixture.rpc }))
vi.mock('../hooks/use-orca-profile-auth-status-refresh', () => ({
  useOrcaProfileAuthStatusRefresh: () => undefined
}))
vi.mock('../store', () => ({
  useAppStore: (select: (state: unknown) => unknown) =>
    select({
      orcaProfileAuthStatus: { state: 'connected', configured: true },
      connectCurrentOrcaProfile: vi.fn(),
      signOutCurrentOrcaProfile: fixture.signOut
    })
}))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
it('opens and cancels each existing data-account removal dialog without calling remove RPC', async () => {
  fixture.rpc.mockResolvedValue({
    opencode: {
      accounts: [{ id: 'fixture-id', label: 'Fixture account', integrations: [] }],
      activeAccountId: null
    },
    devin: {
      accounts: [{ id: 'fixture-id', label: 'Fixture account', integrations: [] }],
      activeAccountId: null
    }
  })
  for (const provider of ['opencode', 'devin'] as const) {
    const view = render(
      <ManagedDataAccountsSection provider={provider} target={{ kind: 'local' }} />
    )
    await screen.findByText('Fixture account')
    await act(async () => {
      await applyMountedAccountsViewerAction({
        type: 'account-removal-dialog',
        provider,
        accountId: 'fixture-id'
      })
    })
    expect(screen.getByRole('dialog')).toBeTruthy()
    await act(async () => {
      await applyMountedAccountsViewerAction({
        type: 'account-removal-dialog',
        provider,
        accountId: null
      })
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(fixture.rpc.mock.calls.every((call) => call[1] === 'accounts.listData')).toBe(true)
    view.unmount()
    await expect(
      applyMountedAccountsViewerAction({
        type: 'account-removal-dialog',
        provider,
        accountId: 'fixture-id'
      })
    ).rejects.toThrow('unavailable')
  }
})
it('opens and closes the actual Orca sign-out confirmation without signing out', async () => {
  const view = render(<OrcaAccountSettingsPane />)
  await act(async () => {
    await applyMountedAccountsViewerAction({ type: 'account-orca-signout-dialog', open: true })
  })
  expect(screen.getByRole('dialog')).toBeTruthy()
  await act(async () => {
    await applyMountedAccountsViewerAction({ type: 'account-orca-signout-dialog', open: false })
  })
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(fixture.signOut).not.toHaveBeenCalled()
  view.unmount()
  await expect(
    applyMountedAccountsViewerAction({ type: 'account-orca-signout-dialog', open: true })
  ).rejects.toThrow('unavailable')
})

it('opens and cancels the actual Claude and Codex dialogs using visible account runtime lookup', async () => {
  const mutate = vi.fn()
  const targets = vi.fn()
  const policy = { action: 'idle', runtimeUnavailable: false }
  function Dialogs() {
    const [claude, setClaude] = useState<RemoveAccountTarget | null>(null)
    const [codex, setCodex] = useState<RemoveAccountTarget | null>(null)
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: This fixture provides every field consumed by the mounted hook and removal dialog; account mutation callbacks remain spies.
    const model = {
      visibleClaudeAccounts: [
        { id: 'claude-id', managedHomeRuntime: 'wsl', wslDistro: 'FixtureWSL' }
      ],
      visibleCodexAccounts: [{ id: 'codex-id', authMethod: 'oauth', managedAuthRuntime: 'host' }],
      setRemoveClaudeTarget: (target: RemoveAccountTarget | null) => {
        targets(target)
        setClaude(target)
      },
      setRemoveCodexTarget: (target: RemoveAccountTarget | null) => {
        targets(target)
        setCodex(target)
      },
      claudeAction: policy.action,
      codexAction: policy.action,
      accountRuntimeUnavailable: policy.runtimeUnavailable,
      runClaudeAccountAction: mutate,
      runCodexAccountAction: mutate,
      settings: null
    } as unknown as AccountsPaneSectionModel
    useMountedProviderRemovalDialogControls(model)
    return renderAccountsRemovalDialogs(model, codex, claude)
  }
  const view = render(<Dialogs />)
  for (const provider of ['claude', 'codex'] as const) {
    const accountId = `${provider}-id`
    await act(async () => {
      await applyMountedAccountsViewerAction({
        type: 'account-removal-dialog',
        provider,
        accountId
      })
    })
    expect(targets).toHaveBeenLastCalledWith({
      id: accountId,
      runtime:
        provider === 'claude'
          ? { runtime: 'wsl', wslDistro: 'FixtureWSL' }
          : { runtime: 'host', wslDistro: null }
    })
    expect(screen.getByRole('dialog')).toBeTruthy()
    await act(async () => {
      await applyMountedAccountsViewerAction({
        type: 'account-removal-dialog',
        provider,
        accountId: null
      })
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  }
  for (const provider of ['claude', 'codex'] as const) {
    await expect(
      applyMountedAccountsViewerAction({
        type: 'account-removal-dialog',
        provider,
        accountId: 'unknown-id'
      })
    ).rejects.toThrow('unavailable')
    for (const action of ['adding', `remove:${provider}-id`]) {
      policy.action = action
      view.rerender(<Dialogs />)
      await expect(
        applyMountedAccountsViewerAction({
          type: 'account-removal-dialog',
          provider,
          accountId: `${provider}-id`
        })
      ).rejects.toThrow('busy')
      expect(screen.queryByRole('dialog')).toBeNull()
    }
    policy.action = 'idle'
    policy.runtimeUnavailable = true
    view.rerender(<Dialogs />)
    await expect(
      applyMountedAccountsViewerAction({
        type: 'account-removal-dialog',
        provider,
        accountId: `${provider}-id`
      })
    ).rejects.toThrow('busy')
    policy.runtimeUnavailable = false
    view.rerender(<Dialogs />)
  }
  expect(mutate).not.toHaveBeenCalled()
  view.unmount()
})
