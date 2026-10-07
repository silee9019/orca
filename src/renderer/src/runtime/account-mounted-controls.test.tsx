// @vitest-environment happy-dom
import { useState } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useMountedAccountSwitcherControls } from './account-mounted-switcher-controls'
import {
  registerProviderRemovalDialogControls,
  registerDataRemovalDialogControls,
  registerOrcaSignOutDialogControls
} from './account-mounted-dialog-controls'
import { registerOpenCodeGoDraftControls } from './account-mounted-draft-controls'
import { applyMountedAccountsViewerAction } from './account-mounted-viewer-actions'

afterEach(cleanup)
it('routes runtime and display controls to only the mounted provider and rejects after unmount', async () => {
  const runtime = vi.fn(async () => undefined)
  function Switcher() {
    const [open, setOpen] = useState(false)
    useMountedAccountSwitcherControls('claude', {
      toggleAccounts: () => setOpen(!open),
      selectRuntime: runtime
    })
    return <span>{open ? 'expanded' : 'collapsed'}</span>
  }
  const view = render(<Switcher />)
  await act(async () => {
    await applyMountedAccountsViewerAction({ type: 'account-switcher-toggle', provider: 'claude' })
  })
  expect(screen.getByText('expanded')).toBeTruthy()
  await applyMountedAccountsViewerAction({
    type: 'account-switcher-runtime',
    provider: 'claude',
    groupKey: 'wsl:fixture'
  })
  expect(runtime).toHaveBeenCalledExactlyOnceWith('wsl:fixture')
  await expect(
    applyMountedAccountsViewerAction({ type: 'account-switcher-toggle', provider: 'codex' })
  ).rejects.toThrow('unavailable')
  view.unmount()
  await expect(
    applyMountedAccountsViewerAction({ type: 'account-switcher-toggle', provider: 'claude' })
  ).rejects.toThrow('unavailable')
})
it('uses exact dialog callbacks  without persistence and removes registrations', async () => {
  const claude = vi.fn(),
    codex = vi.fn(),
    opencode = vi.fn(),
    devin = vi.fn(),
    signout = vi.fn()
  const unregister = [
    registerProviderRemovalDialogControls({ claude, codex }),
    registerDataRemovalDialogControls('opencode', { set: opencode }),
    registerDataRemovalDialogControls('devin', { set: devin }),
    registerOrcaSignOutDialogControls({ setOpen: signout })
  ]
  try {
    for (const provider of ['claude', 'codex', 'opencode', 'devin'] as const) {
      await applyMountedAccountsViewerAction({
        type: 'account-removal-dialog',
        provider,
        accountId: 'fixture-id'
      })
      await applyMountedAccountsViewerAction({
        type: 'account-removal-dialog',
        provider,
        accountId: null
      })
    }
    for (const callback of [claude, codex, opencode, devin]) {
      expect(callback.mock.calls).toEqual([['fixture-id'], [null]])
    }
    await applyMountedAccountsViewerAction({ type: 'account-orca-signout-dialog', open: true })
    await applyMountedAccountsViewerAction({ type: 'account-orca-signout-dialog', open: false })
    expect(signout.mock.calls).toEqual([[true], [false]])
  } finally {
    unregister.forEach((remove) => remove())
  }
  await expect(
    applyMountedAccountsViewerAction({
      type: 'account-removal-dialog',
      provider: 'claude',
      accountId: null
    })
  ).rejects.toThrow('unavailable')
})
it('sanitizes secret errors thrown by mounted callbacks', async () => {
  const sentinel = 'private-callback-fixture'
  const unregister = registerOpenCodeGoDraftControls({
    set: () => {
      throw new Error(sentinel)
    }
  })
  try {
    await expect(
      applyMountedAccountsViewerAction({ type: 'account-opencode-go-draft', value: sentinel })
    ).rejects.toThrow('could not be applied')
  } finally {
    unregister()
  }
})
