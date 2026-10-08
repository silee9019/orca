import { getDefaultSettings } from '../../../../shared/constants'
import { TooltipProvider } from '@/components/ui/tooltip'
import { fireEvent, screen } from '@testing-library/react'
import { MobileEmulatorTabIntroCallout } from './MobileEmulatorTabIntroCallout'
import { applyEmulatorConnectionsViewerRequest } from '@/runtime/emulator-connections-viewer-controller'
import type { ConnectionsViewerCommand } from '../../../../shared/rpc-contract/connections-viewer-params'
// @vitest-environment happy-dom

import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { useMobileEmulatorTabIntroActions } from './use-mobile-emulator-tab-intro-actions'

vi.mock('sonner', () => ({
  toast: {
    dismiss: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  }
}))

let root: Root | null = null
let container: HTMLDivElement | null = null
let latestActions: ReturnType<typeof useMobileEmulatorTabIntroActions> | null = null

function Probe(): null {
  latestActions = useMobileEmulatorTabIntroActions()
  return null
}

async function renderProbe(content: ReactElement = <Probe />): Promise<void> {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(content)
  })
}

async function flushAsyncAction(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function configureStoreForHideAction(overrides: {
  updateSettings: AppState['updateSettings']
  closeUnifiedTab?: AppState['closeUnifiedTab']
  dismissMobileEmulatorTabIntro?: AppState['dismissMobileEmulatorTabIntro']
}): {
  closeUnifiedTab: NonNullable<typeof overrides.closeUnifiedTab>
  dismissMobileEmulatorTabIntro: NonNullable<typeof overrides.dismissMobileEmulatorTabIntro>
  openSettingsPage: AppState['openSettingsPage']
  openSettingsTarget: AppState['openSettingsTarget']
} {
  const closeUnifiedTab =
    overrides.closeUnifiedTab ??
    vi.fn(() => ({
      closedTabId: 'simulator-tab',
      wasLastTab: false,
      worktreeId: 'worktree-1'
    }))
  const dismissMobileEmulatorTabIntro = overrides.dismissMobileEmulatorTabIntro ?? vi.fn()
  const openSettingsPage = vi.fn()
  const openSettingsTarget = vi.fn()

  useAppStore.setState({
    closeUnifiedTab,
    dismissMobileEmulatorTabIntro,
    openSettingsPage,
    openSettingsTarget,
    settings: { mobileEmulatorEnabled: true } as AppState['settings'],
    unifiedTabsByWorktree: {
      'worktree-1': [
        { id: 'simulator-tab', contentType: 'simulator' },
        { id: 'terminal-tab', contentType: 'terminal' }
      ]
    } as unknown as AppState['unifiedTabsByWorktree'],
    updateSettings: overrides.updateSettings
  })

  return {
    closeUnifiedTab,
    dismissMobileEmulatorTabIntro,
    openSettingsPage,
    openSettingsTarget
  }
}

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount()
    })
  }
  root = null
  container?.remove()
  container = null
  latestActions = null
  useAppStore.setState(useAppStore.getInitialState(), true)
  vi.clearAllMocks()
})

describe('useMobileEmulatorTabIntroActions', () => {
  it('hides the feature, dismisses the intro, and closes simulator tabs after settings apply', async () => {
    const updateSettings = vi.fn<AppState['updateSettings']>(async () => {
      useAppStore.setState({
        settings: { mobileEmulatorEnabled: false } as AppState['settings']
      })
    })
    const { closeUnifiedTab, dismissMobileEmulatorTabIntro } = configureStoreForHideAction({
      updateSettings
    })

    await renderProbe()

    latestActions?.hideIntro()
    await flushAsyncAction()

    expect(updateSettings).toHaveBeenCalledWith({ mobileEmulatorEnabled: false })
    expect(dismissMobileEmulatorTabIntro).toHaveBeenCalledTimes(1)
    expect(closeUnifiedTab).toHaveBeenCalledTimes(1)
    expect(closeUnifiedTab).toHaveBeenCalledWith('simulator-tab')
    expect(toast.info).toHaveBeenCalledWith(
      'Mobile Emulator hidden',
      expect.objectContaining({ id: 'mobile-emulator-hidden', duration: 30_000 })
    )
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('does not dismiss or close tabs when the setting write does not stick', async () => {
    const updateSettings = vi.fn<AppState['updateSettings']>(async () => {})
    const { closeUnifiedTab, dismissMobileEmulatorTabIntro } = configureStoreForHideAction({
      updateSettings
    })

    await renderProbe()

    latestActions?.hideIntro()
    await flushAsyncAction()

    expect(dismissMobileEmulatorTabIntro).not.toHaveBeenCalled()
    expect(closeUnifiedTab).not.toHaveBeenCalled()
    expect(toast.info).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Could not hide Mobile Emulator.')
  })
})

async function applyIntro(command: ConnectionsViewerCommand) {
  let pending: ReturnType<typeof applyEmulatorConnectionsViewerRequest> | undefined
  await act(async () => {
    pending = applyEmulatorConnectionsViewerRequest({
      id: 'intro-real-parent',
      expiresAt: Date.now() + 100,
      command
    })
  })
  if (!pending) {
    throw new Error('missing_request')
  }
  return pending
}
function configureRealIntro(failWrite = false) {
  let storedDismissed = false
  let storedEnabled = true
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      ui: {
        set: vi.fn(async (updates: { mobileEmulatorTabIntroDismissed: boolean }) => {
          storedDismissed = updates.mobileEmulatorTabIntroDismissed
        }),
        get: vi.fn(async () => ({ mobileEmulatorTabIntroDismissed: storedDismissed }))
      },
      settings: { get: vi.fn(async () => ({ mobileEmulatorEnabled: storedEnabled })) }
    }
  })
  const dismiss = useAppStore.getInitialState().dismissMobileEmulatorTabIntro
  const close = vi.fn<AppState['closeUnifiedTab']>((id) => {
    const current = useAppStore.getState()
    useAppStore.setState({
      unifiedTabsByWorktree: Object.fromEntries(
        Object.entries(current.unifiedTabsByWorktree).map(([key, tabs]) => [
          key,
          tabs.filter((tab) => tab.id !== id)
        ])
      )
    })
    return { closedTabId: id, wasLastTab: false, worktreeId: 'worktree-1' }
  })
  const updateSettings = vi.fn<AppState['updateSettings']>(async () => {
    if (failWrite) {
      return
    }
    storedEnabled = false
    const settings = useAppStore.getState().settings
    if (settings) {
      useAppStore.setState({ settings: { ...settings, mobileEmulatorEnabled: false } })
    }
  })
  configureStoreForHideAction({
    updateSettings,
    closeUnifiedTab: close,
    dismissMobileEmulatorTabIntro: dismiss
  })
  useAppStore.setState({
    settings: getDefaultSettings('/fixture'),
    mobileEmulatorTabIntroDismissed: false
  })
  const originalTabs = useAppStore.getState().unifiedTabsByWorktree
  return {
    close,
    updateSettings,
    reset: () => {
      storedDismissed = false
      storedEnabled = true
      useAppStore.setState({
        mobileEmulatorTabIntroDismissed: false,
        settings: getDefaultSettings('/fixture'),
        unifiedTabsByWorktree: originalTabs
      })
    }
  }
}
describe('actual intro callout and typed parent effects', () => {
  it('pairs native Keep/Dismiss with typed actions and the existing UI persistence owner', async () => {
    const owner = configureRealIntro()
    await renderProbe(
      <TooltipProvider>
        <MobileEmulatorTabIntroCallout />
      </TooltipProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }))
    await flushAsyncAction()
    expect(useAppStore.getState().mobileEmulatorTabIntroDismissed).toBe(true)
    await act(async () => owner.reset())
    expect(await applyIntro({ viewerId: 7, operation: 'emulator.intro-keep' })).toMatchObject({
      applied: true,
      persisted: true
    })
    await act(async () => owner.reset())
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    await flushAsyncAction()
    expect(useAppStore.getState().mobileEmulatorTabIntroDismissed).toBe(true)
    await act(async () => owner.reset())
    expect(await applyIntro({ viewerId: 7, operation: 'emulator.intro-dismiss' })).toMatchObject({
      applied: true,
      persisted: true
    })
    expect(owner.updateSettings).not.toHaveBeenCalled()
    expect(owner.close).not.toHaveBeenCalled()
  })
  it('pairs native and typed Hide with actual simulator-tab closure while preserving terminal tabs and menu pointer semantics', async () => {
    const owner = configureRealIntro()
    await renderProbe(
      <TooltipProvider>
        <MobileEmulatorTabIntroCallout />
      </TooltipProvider>
    )
    const callout = container?.querySelector('.mobile-emulator-tab-intro-callout--menu')
    if (!callout) {
      throw new Error('missing_callout')
    }
    const pointer = new Event('pointerdown', { bubbles: true, cancelable: true })
    callout.dispatchEvent(pointer)
    expect(pointer.defaultPrevented).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    await flushAsyncAction()
    expect(owner.close).toHaveBeenCalledExactlyOnceWith('simulator-tab')
    expect(useAppStore.getState().unifiedTabsByWorktree['worktree-1'].map((tab) => tab.id)).toEqual(
      ['terminal-tab']
    )
    await act(async () => owner.reset())
    expect(await applyIntro({ viewerId: 7, operation: 'emulator.intro-hide' })).toMatchObject({
      applied: true,
      persisted: true,
      state: { enabled: false, introDismissed: true }
    })
    expect(owner.close).toHaveBeenCalledTimes(2)
    expect(useAppStore.getState().unifiedTabsByWorktree['worktree-1'].map((tab) => tab.id)).toEqual(
      ['terminal-tab']
    )
  })
  it('retains tabs and intro when the settings owner does not apply the hide', async () => {
    const owner = configureRealIntro(true)
    await renderProbe(
      <TooltipProvider>
        <MobileEmulatorTabIntroCallout />
      </TooltipProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    await flushAsyncAction()
    expect(await applyIntro({ viewerId: 7, operation: 'emulator.intro-hide' })).toMatchObject({
      applied: false,
      persisted: false,
      state: { enabled: true, introDismissed: false }
    })
    expect(owner.close).not.toHaveBeenCalled()
    expect(useAppStore.getState().unifiedTabsByWorktree['worktree-1']).toHaveLength(2)
  })
})
