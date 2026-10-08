// @vitest-environment happy-dom
import { mount, target, placement, guest, finishLoad } from './browser-client-command.test-fixture'
import { act } from '@testing-library/react'
import { flushSync } from 'react-dom'
import { expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { requestBrowserClientNavigation } from '@/runtime/browser-client-navigation-request'
function replaceOwnership(kind: 'workspace' | 'handle'): void {
  if (kind === 'workspace') {
    useAppStore.setState({ activeWorktreeId: 'folder:other' })
    useAppStore.setState({ activeWorktreeId: target.worktreeId })
  } else {
    const handles = useAppStore.getState().remoteBrowserPageHandlesByPageId
    useAppStore.setState({
      remoteBrowserPageHandlesByPageId: {
        [target.page]: {
          ...handles[target.page],
          placement: { ...placement, pageHostGeneration: 5 }
        }
      }
    })
    useAppStore.setState({ remoteBrowserPageHandlesByPageId: handles })
  }
}
it.each(['workspace', 'handle'] as const)(
  'invalidates pending actual navigation after %s ABA before load completion',
  async (kind) => {
    mount()
    let pending: ReturnType<typeof requestBrowserClientNavigation> | undefined
    await act(async () => {
      pending = requestBrowserClientNavigation(target, 'https://after.test/', Date.now() + 5000)
      void pending.catch(() => {})
    })
    if (!pending) {
      throw new Error('missing request')
    }
    expect(guest.loadURL).toHaveBeenCalledWith('https://after.test/')
    await act(async () => replaceOwnership(kind))
    await act(async () => finishLoad())
    await expect(pending).rejects.toThrow('owner_changed_effect_unknown')
  }
)
it.each(['workspace', 'handle'] as const)(
  'invalidates captured navigation offer after %s ABA before guest submission',
  async (kind) => {
    mount()
    const dispatch = window.dispatchEvent.bind(window)
    const spy = vi.spyOn(window, 'dispatchEvent').mockImplementation((event) => {
      const result = dispatch(event)
      if (event.type === 'orca:browser-client-navigation-command') {
        replaceOwnership(kind)
      }
      return result
    })
    let pending: ReturnType<typeof requestBrowserClientNavigation> | undefined
    await act(async () => {
      pending = requestBrowserClientNavigation(target, 'https://after.test/', Date.now() + 5000)
      void pending.catch(() => {})
    })
    spy.mockRestore()
    if (!pending) {
      throw new Error('missing request')
    }
    await act(async () => {
      if (vi.mocked(guest.loadURL).mock.calls.length) {
        finishLoad()
      }
    })
    await expect(pending).rejects.toThrow('owner_changed_effect_unknown')
    expect(guest.loadURL).not.toHaveBeenCalled()
  }
)

it('refuses captured navigation when actual Pane worktree props change before submission', async () => {
  let renderedWorktree = target.worktreeId
  mount(true, () => renderedWorktree)
  const dispatch = window.dispatchEvent.bind(window)
  const spy = vi.spyOn(window, 'dispatchEvent').mockImplementation((event) => {
    const result = dispatch(event)
    if (event.type === 'orca:browser-client-navigation-command') {
      flushSync(() => {
        renderedWorktree = 'folder:other'
        useAppStore.setState((state) => ({
          browserPagesByWorkspace: Object.fromEntries(
            Object.entries(state.browserPagesByWorkspace).map(([id, pages]) => [
              id,
              pages.map((page) => ({ ...page, title: 'updated' }))
            ])
          )
        }))
      })
    }
    return result
  })
  try {
    let pending: ReturnType<typeof requestBrowserClientNavigation> | undefined
    await act(async () => {
      pending = requestBrowserClientNavigation(target, 'https://after.test/', Date.now() + 5000)
      void pending.catch(() => {})
    })
    if (!pending) {
      throw new Error('missing request')
    }
    await act(async () => {
      if (vi.mocked(guest.loadURL).mock.calls.length) {
        finishLoad()
      }
    })
    await expect(pending).rejects.toThrow('owner_changed_effect_unknown')
    expect(guest.loadURL).not.toHaveBeenCalled()
  } finally {
    spy.mockRestore()
  }
})
