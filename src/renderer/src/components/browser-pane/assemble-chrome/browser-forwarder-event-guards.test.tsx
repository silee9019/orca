// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import ClientHostedBrowserTab from '../../tab-bar/ClientHostedBrowserTab'
import { RemoteRuntimeEgressIndicator } from './browser-egress-indicator'

const initial = useAppStore.getInitialState()
afterEach(() => {
  cleanup()
  useAppStore.setState(initial, true)
})

it('opens the actual egress popover without bubbling the trigger click to the address form', () => {
  const outerClick = vi.fn()
  render(
    <TooltipProvider>
      <div onClick={outerClick}>
        <RemoteRuntimeEgressIndicator
          runtimeEnvironmentId="fixture-environment"
          presentation="streamed"
        />
      </div>
    </TooltipProvider>
  )
  fireEvent.click(screen.getByTestId('ssh-egress-indicator'))
  expect(screen.getByTestId('ssh-egress-indicator-settings')).not.toBeNull()
  expect(outerClick).not.toHaveBeenCalled()
})

it('keeps actual egress content clicks local while the existing settings owner changes the store', () => {
  const outerClick = vi.fn()
  render(
    <TooltipProvider>
      <div onClick={outerClick}>
        <RemoteRuntimeEgressIndicator
          runtimeEnvironmentId="fixture-environment"
          presentation="streamed"
        />
      </div>
    </TooltipProvider>
  )
  fireEvent.click(screen.getByTestId('ssh-egress-indicator'))
  outerClick.mockClear()
  fireEvent.click(screen.getByTestId('ssh-egress-indicator-settings'))
  expect(outerClick).not.toHaveBeenCalled()
  expect(screen.queryByTestId('ssh-egress-indicator-settings')).toBeNull()
  expect(useAppStore.getState().activeView).toBe('settings')
  expect(useAppStore.getState().settingsNavigationTarget).toMatchObject({
    pane: 'browser',
    repoId: null,
    sectionId: 'browser-client-hosted-remote'
  })
})

it('stops close-button pointerdown before the hosted row activates while preserving its close click', () => {
  const activate = vi.fn()
  const close = vi.fn()
  render(
    <TooltipProvider>
      <ClientHostedBrowserTab
        row={{
          browserPageId: 'fixture-page',
          worktreeId: 'folder:fixture',
          url: 'https://fixture.invalid/',
          title: 'Fixture',
          loading: false,
          browserHostClientId: 'fixture-client',
          hostDeviceName: null,
          hostAbsent: false
        }}
        isActive={false}
        hasTabsToRight={false}
        onActivate={activate}
        onClose={close}
      />
    </TooltipProvider>
  )
  const button = screen.getByRole('button', { name: 'Close hosted page' })
  fireEvent.pointerDown(button, { pointerId: 1, button: 0 })
  expect(activate).not.toHaveBeenCalled()
  fireEvent.click(button)
  expect(close).toHaveBeenCalledOnce()
  expect(activate).not.toHaveBeenCalled()
  const row = button.closest('[data-client-hosted-browser-row-id]')
  if (!row) {
    throw new Error('missing actual hosted row')
  }
  fireEvent.pointerDown(row, { pointerId: 2, button: 0 })
  expect(activate).toHaveBeenCalledOnce()
})
