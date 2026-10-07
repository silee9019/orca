// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ refresh: vi.fn(async () => {}) }))
vi.mock('../../store', () => ({
  useAppStore: (select: (state: unknown) => unknown) =>
    select({
      refreshRateLimits: mocks.refresh,
      rateLimits: { cursor: null },
      settingsSearchQuery: ''
    })
}))
import { CursorAccountsSection } from './CursorAccountsSection'
import { refreshMountedUsageAccount } from '@/runtime/use-usage-account-refresh-controller'
it('retains the actual Cursor account refresh spinner until its existing store callback settles', async () => {
  let finish: () => void = () => {}
  mocks.refresh.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      })
  )
  Object.assign(window, {
    api: {
      cursorAccounts: {
        getStatus: vi.fn(async () => ({
          signedIn: false,
          email: null,
          displayName: null,
          credentialSource: null,
          planType: null,
          tokenFresh: false,
          error: null
        }))
      }
    }
  })
  const container = document.createElement('div')
  const root = createRoot(container)
  await act(async () => {
    root.render(<CursorAccountsSection />)
  })
  const button = Array.from(container.querySelectorAll('button')).find((node) =>
    node.textContent?.includes('Refresh usage')
  )
  expect(button?.disabled).toBe(false)
  let operation: Promise<unknown> = Promise.resolve()
  act(() => {
    operation = refreshMountedUsageAccount('cursor')
  })
  expect(button?.disabled).toBe(true)
  await expect(refreshMountedUsageAccount('cursor')).rejects.toThrow('busy')
  await act(async () => {
    finish()
    await Promise.resolve()
  })
  await operation
  expect(button?.disabled).toBe(false)
  expect(mocks.refresh).toHaveBeenCalledOnce()
  act(() => root.unmount())
  await expect(refreshMountedUsageAccount('cursor')).rejects.toThrow('unavailable')
})
