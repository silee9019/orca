// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { showMobileEmulatorHiddenToast } from './mobile-emulator-hidden-toast'
import { applyEmulatorConnectionsViewerRequest } from '@/runtime/emulator-connections-viewer-controller'
function show() {
  showMobileEmulatorHiddenToast(useAppStore.getState())
  const entry = toast.getToasts().find((value) => value.id === 'mobile-emulator-hidden')
  if (!entry || !('description' in entry)) {
    throw new Error('missing_toast')
  }
  render(<>{entry.description}</>)
}
function invoke() {
  return applyEmulatorConnectionsViewerRequest({
    id: 'hidden-toast',
    expiresAt: Date.now() + 300,
    command: { viewerId: 7, operation: 'emulator.hidden-settings' }
  })
}
beforeEach(() => {
  toast.dismiss()
  useAppStore.setState(useAppStore.getInitialState(), true)
})
afterEach(() => {
  cleanup()
  toast.dismiss()
  useAppStore.setState(useAppStore.getInitialState(), true)
})
it('pairs the actual toast Settings button with the typed canonical actions and exact dismissal', async () => {
  show()
  fireEvent.click(screen.getByRole('button', { name: 'Settings › Mobile Emulator' }))
  expect(useAppStore.getState()).toMatchObject({
    activeView: 'settings',
    settingsNavigationTarget: { pane: 'mobile-emulator', repoId: null }
  })
  expect(toast.getToasts().some((entry) => entry.id === 'mobile-emulator-hidden')).toBe(false)
  cleanup()
  useAppStore.setState({ activeView: 'skills', settingsNavigationTarget: null })
  show()
  let result: Awaited<ReturnType<typeof invoke>> | undefined
  await act(async () => {
    result = await invoke()
  })
  expect(result).toMatchObject({ applied: true, persisted: null, state: { settingsOpen: true } })
  expect(toast.getToasts().some((entry) => entry.id === 'mobile-emulator-hidden')).toBe(false)
})
it('does not act on an absent toast or stale native button after dismissal', async () => {
  show()
  toast.dismiss('mobile-emulator-hidden')
  useAppStore.setState({ activeView: 'skills', settingsNavigationTarget: null })
  fireEvent.click(screen.getByRole('button', { name: 'Settings › Mobile Emulator' }))
  expect(useAppStore.getState().activeView).toBe('skills')
  await expect(invoke()).resolves.toMatchObject({ applied: false, state: { settingsOpen: false } })
})

it('preserves a replacement toast when the earlier native description button fires', () => {
  show()
  const oldButton = screen.getByRole('button', { name: 'Settings › Mobile Emulator' })
  toast.dismiss('mobile-emulator-hidden')
  showMobileEmulatorHiddenToast(useAppStore.getState())
  useAppStore.setState({ activeView: 'skills', settingsNavigationTarget: null })
  fireEvent.click(oldButton)
  expect(useAppStore.getState().activeView).toBe('skills')
  expect(toast.getToasts().some((entry) => entry.id === 'mobile-emulator-hidden')).toBe(true)
})
