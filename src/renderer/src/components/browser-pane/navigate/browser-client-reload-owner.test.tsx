// @vitest-environment happy-dom
import { mount, target, guest, placement } from './browser-client-command.test-fixture'
import { act } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { applyBrowserViewerRequest } from '@/runtime/browser-viewer-bridge'
async function reload() {
  let pending: ReturnType<typeof applyBrowserViewerRequest> | undefined
  await act(async () => {
    pending = applyBrowserViewerRequest({
      id: 'client-reload',
      expiresAt: Date.now() + 2000,
      command: { viewer: 'host', operation: 'client-reload', target, entry: 'context-menu' }
    })
    void pending.catch(() => {})
  })
  if (!pending) {
    throw new Error('missing reload request')
  }
  return pending
}
it('reuses the actual client context reload helper and reads its loading initiation', async () => {
  mount()
  expect(await reload()).toMatchObject({
    clientReload: { target, accepted: true, loading: true, completionObserved: false }
  })
  expect(guest.reload).toHaveBeenCalledTimes(1)
  expect(guest.reloadIgnoringCache).not.toHaveBeenCalled()
  expect(
    Object.values(useAppStore.getState().browserPagesByWorkspace)
      .flat()
      .find((page) => page.id === target.page)?.loading
  ).toBe(true)
})

it('preserves the original missing-guest fallback without acknowledging recovery completion', async () => {
  mount()
  vi.spyOn(guest, 'getWebContentsId').mockImplementationOnce(() => {
    throw new Error('guest missing')
  })
  expect(await reload()).toMatchObject({
    clientReload: { accepted: true, loading: false, completionObserved: false }
  })
  expect(document.body.textContent).toContain('Client-hosted browser unavailable')
  expect(guest.reload).not.toHaveBeenCalled()
})
it('refuses a not-ready guest instead of treating the original false return as success', async () => {
  mount()
  vi.spyOn(guest, 'reload').mockImplementationOnce(() => {
    throw new Error('not ready')
  })
  await expect(reload()).rejects.toThrow('guest_not_ready')
})
it.each(['duplicate', 'inactive', 'stale', 'staged', 'restored'] as const)(
  'refuses %s client reload owners before the original helper runs',
  async (kind) => {
    if (kind === 'stale' || kind === 'staged' || kind === 'restored') {
      useAppStore.setState({
        remoteBrowserPageHandlesByPageId: {
          [target.page]: {
            environmentId: target.environmentId,
            remotePageId: target.remotePageId,
            placement: kind === 'stale' ? { ...placement, pageHostGeneration: 5 } : placement,
            ...(kind === 'staged' ? { staged: true } : {}),
            ...(kind === 'restored' ? { restoredFromSession: true } : {})
          }
        }
      })
    }
    mount(kind !== 'inactive')
    if (kind === 'duplicate') {
      mount()
    }
    await expect(reload()).rejects.toThrow()
    expect(guest.reload).not.toHaveBeenCalled()
  }
)
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
  'invalidates captured client reload offer after %s ABA before invoking the helper',
  async (kind) => {
    mount()
    const dispatch = window.dispatchEvent.bind(window)
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent').mockImplementation((event) => {
      const result = dispatch(event)
      if (event.type === 'orca:browser-client-reload-command') {
        replaceOwnership(kind)
      }
      return result
    })
    try {
      await expect(reload()).rejects.toThrow('owner_changed_effect_unknown')
      expect(guest.reload).not.toHaveBeenCalled()
    } finally {
      dispatchSpy.mockRestore()
    }
  }
)
it.each(['workspace', 'handle'] as const)(
  'rejects a client reload receipt after %s ABA inside the guest call',
  async (kind) => {
    mount()
    vi.spyOn(guest, 'reload').mockImplementationOnce(() => replaceOwnership(kind))
    await expect(reload()).rejects.toThrow('owner_changed_effect_unknown')
  }
)
it('rejects a client reload receipt after the deadline without running timeout tasks', async () => {
  mount()
  const now = Date.now()
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
  vi.spyOn(guest, 'reload').mockImplementationOnce(() => {
    clock.mockReturnValue(now + 2001)
  })
  try {
    await expect(reload()).rejects.toThrow('request_expired')
  } finally {
    clock.mockRestore()
  }
})
