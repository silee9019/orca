import { describe, expect, it, vi } from 'vitest'
import type { AppSurfaceAction } from '../../../shared/app-surface-control'
import { useAppShellControl } from './use-app-shell-control'
const fixture = vi.hoisted(() => {
  const result: {
    handle?: (input: AppSurfaceAction) => Promise<unknown>
    state: {
      sidebarOpen: boolean
      rightSidebarOpen: boolean
      toggleSidebar: () => void
      toggleRightSidebar: () => void
    }
  } = {
    state: {
      sidebarOpen: false,
      rightSidebarOpen: false,
      toggleSidebar: () => {
        result.state.sidebarOpen = !result.state.sidebarOpen
      },
      toggleRightSidebar: () => {
        result.state.rightSidebarOpen = !result.state.rightSidebarOpen
      }
    }
  }
  return result
})
vi.mock('../hooks/ipc-events/app-surface-ipc-bridge', () => ({
  useAppSurfaceControl: (_kind: string, handle: typeof fixture.handle) => {
    fixture.handle = handle
  }
}))
vi.mock('../store', () => ({ useAppStore: { getState: () => fixture.state } }))
vi.mock('../components/onboarding/show-onboarding-event', () => ({
  showOnboardingFromRenderer: vi.fn()
}))
describe('app shell callback state', () => {
  it('reads the same sidebar state and refuses a disabled floating overlay', async () => {
    const open = vi.fn()
    useAppShellControl({ open: false, enabled: false, setOpenWithFocus: open })
    await fixture.handle?.({ kind: 'shell', action: 'sidebar' })
    await fixture.handle?.({ kind: 'shell', action: 'right-sidebar' })
    await expect(fixture.handle?.({ kind: 'shell', action: 'status' })).resolves.toMatchObject({
      sidebarOpen: true,
      rightSidebarOpen: true
    })
    await expect(
      fixture.handle?.({ kind: 'shell', action: 'floating', open: true })
    ).rejects.toThrow('Enable floating')
    expect(open).not.toHaveBeenCalled()
    useAppShellControl({ open: false, enabled: true, setOpenWithFocus: open })
    await fixture.handle?.({ kind: 'shell', action: 'floating', open: true })
    expect(open).toHaveBeenCalledWith(true)
  })
})
