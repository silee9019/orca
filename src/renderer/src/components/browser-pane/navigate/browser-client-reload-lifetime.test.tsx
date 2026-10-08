// @vitest-environment happy-dom
import { mount, target, guest } from './browser-client-command.test-fixture'
import { act } from '@testing-library/react'
import { flushSync } from 'react-dom'
import { expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { applyBrowserClientReloadRequest } from '@/runtime/browser-client-reload-request'
import { isBrowserClientPageViewerTargetCurrent } from '@/runtime/browser-client-page-viewer-target'
it('refuses a captured reload after actual Pane props move while the old Store target remains current', async () => {
  const state = useAppStore.getState()
  const oldPage = Object.values(state.browserPagesByWorkspace)
    .flat()
    .find((page) => page.id === target.page)
  if (!oldPage) {
    throw new Error('missing page')
  }
  let renderedWorktree = target.worktreeId
  mount(true, () => renderedWorktree)
  const targetStates: boolean[] = []
  const unsubscribe = useAppStore.subscribe(() => {
    targetStates.push(isBrowserClientPageViewerTargetCurrent(target))
  })
  const dispatch = window.dispatchEvent.bind(window)
  const spy = vi.spyOn(window, 'dispatchEvent').mockImplementation((event) => {
    const result = dispatch(event)
    if (event.type === 'orca:browser-client-reload-command') {
      flushSync(() => {
        renderedWorktree = 'folder:other'
        useAppStore.setState((current) => ({
          browserPagesByWorkspace: {
            ...current.browserPagesByWorkspace,
            [oldPage.workspaceId]: current.browserPagesByWorkspace[oldPage.workspaceId].map(
              (page) => ({ ...page, title: 'updated' })
            )
          }
        }))
      })
      expect(isBrowserClientPageViewerTargetCurrent(target)).toBe(true)
    }
    return result
  })
  try {
    let pending: ReturnType<typeof applyBrowserClientReloadRequest> | undefined
    await act(async () => {
      pending = applyBrowserClientReloadRequest(
        { viewer: 'host', operation: 'client-reload', target, entry: 'context-menu' },
        Date.now() + 5000
      )
      void pending.catch(() => {})
    })
    if (!pending) {
      throw new Error('missing reload')
    }
    await expect(pending).rejects.toThrow('owner_changed_effect_unknown')
    expect(guest.reload).not.toHaveBeenCalled()
    expect(targetStates).not.toContain(false)
  } finally {
    spy.mockRestore()
    unsubscribe()
  }
})
