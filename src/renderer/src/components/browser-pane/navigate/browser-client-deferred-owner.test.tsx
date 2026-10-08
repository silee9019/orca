// @vitest-environment happy-dom
import {
  mount,
  target,
  guest,
  placement,
  finishLoad,
  fixture
} from './browser-client-command.test-fixture'
import { act } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { stageWebRuntimeBrowserTab } from '@/runtime/web-runtime-browser-tab-staging'
import {
  applyBrowserClientDeferredRequest,
  BROWSER_CLIENT_DEFERRED_EVENT
} from '@/runtime/browser-client-deferred-request'
import { applyBrowserClientNavigationRequest } from '@/runtime/browser-client-navigation-request'
import {
  clearBrowserPageDeferredNavigation,
  readBrowserPageDeferredNavigation
} from './browser-page-deferred-navigation'
const stagedTarget = {
  worktreeId: target.worktreeId,
  page: target.page,
  environmentId: target.environmentId,
  remotePageId: target.remotePageId
}
const command = {
  viewer: 'host' as const,
  operation: 'client-deferred' as const,
  entry: 'address-bar-staged' as const,
  target: stagedTarget,
  value: 'https://after.test/'
}
function mountStage(active = true) {
  return mount(
    active,
    () => target.worktreeId,
    false,
    (handle) => (handle?.placement?.kind === 'client' ? handle.placement : null)
  )
}
beforeEach(() => {
  clearBrowserPageDeferredNavigation(target.page)
  useAppStore.setState({
    remoteBrowserPageHandlesByPageId: {
      [target.page]: {
        environmentId: target.environmentId,
        remotePageId: target.remotePageId,
        staged: true,
        stagedClientHosted: true
      }
    }
  })
})
afterEach(() => {
  clearBrowserPageDeferredNavigation(target.page)
  vi.restoreAllMocks()
})
it('queues through the actual staged ClientPane address owner without claiming host placement or load completion', async () => {
  mountStage()
  let result: unknown
  await act(async () => {
    result = await applyBrowserClientDeferredRequest(command, Date.now() + 5000)
  })
  expect(result).toMatchObject({
    clientDeferred: {
      target: stagedTarget,
      queued: true,
      completionObserved: false,
      hostPlacementKnown: false,
      url: command.value
    }
  })
  expect(readBrowserPageDeferredNavigation(target.page)).toMatchObject({ url: command.value })
  expect(guest.loadURL).not.toHaveBeenCalled()
})
it('the existing adopted attachment consumes the queue once and uses its original guest and metadata publisher', async () => {
  mountStage()
  await act(async () => {
    await applyBrowserClientDeferredRequest(command, Date.now() + 5000)
  })
  expect(fixture.attach).not.toHaveBeenCalled()
  await act(async () => {
    useAppStore.setState({
      remoteBrowserPageHandlesByPageId: {
        [target.page]: {
          environmentId: target.environmentId,
          remotePageId: target.remotePageId,
          placement
        }
      }
    })
  })
  expect(guest.loadURL).toHaveBeenCalledExactlyOnceWith(command.value)
  expect(readBrowserPageDeferredNavigation(target.page)).toBeNull()
  await act(async () => {
    finishLoad()
  })
  const page = Object.values(useAppStore.getState().browserPagesByWorkspace)
    .flat()
    .find((p) => p.id === target.page)
  expect(page).toMatchObject({ url: command.value, loading: false })
  expect(fixture.publish).toHaveBeenCalled()
})
it('selects exactly one active staged owner and refuses duplicate active owners before queue mutation', async () => {
  mountStage(false)
  mountStage()
  await act(async () => {
    await applyBrowserClientDeferredRequest(command, Date.now() + 5000)
  })
  clearBrowserPageDeferredNavigation(target.page)
  mountStage()
  await act(async () => {
    await expect(applyBrowserClientDeferredRequest(command, Date.now() + 5000)).rejects.toThrow(
      'ambiguous'
    )
  })
  expect(readBrowserPageDeferredNavigation(target.page)).toBeNull()
})
for (const boundary of ['workspace', 'handle', 'deadline'] as const) {
  it(`refuses captured offer after ${boundary} changes before perform`, async () => {
    mountStage()
    const listener = () => {
      if (boundary === 'workspace') {
        useAppStore.setState({ activeWorktreeId: 'folder:other' })
        useAppStore.setState({ activeWorktreeId: target.worktreeId })
      } else if (boundary === 'handle') {
        const handles = useAppStore.getState().remoteBrowserPageHandlesByPageId
        useAppStore.setState({
          remoteBrowserPageHandlesByPageId: { [target.page]: { ...handles[target.page] } }
        })
        useAppStore.setState({ remoteBrowserPageHandlesByPageId: handles })
      } else {
        vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 10000)
      }
    }
    window.addEventListener(BROWSER_CLIENT_DEFERRED_EVENT, listener)
    try {
      await act(async () => {
        await expect(
          applyBrowserClientDeferredRequest(command, Date.now() + 5000)
        ).rejects.toThrow()
      })
    } finally {
      window.removeEventListener(BROWSER_CLIENT_DEFERRED_EVENT, listener)
    }
    expect(readBrowserPageDeferredNavigation(target.page)).toBeNull()
    expect(guest.loadURL).not.toHaveBeenCalled()
  })
}
it('keeps the materialized command refusal for staged pages', async () => {
  mountStage()
  await expect(
    applyBrowserClientNavigationRequest({ target, url: command.value }, Date.now() + 5000)
  ).rejects.toThrow()
  expect(readBrowserPageDeferredNavigation(target.page)).toBeNull()
})
it('retains original last-write-wins and expiration instead of claiming later completion', async () => {
  mountStage()
  await act(async () => {
    await applyBrowserClientDeferredRequest(command, Date.now() + 5000)
    await applyBrowserClientDeferredRequest(
      { ...command, value: 'https://last.test/' },
      Date.now() + 5000
    )
  })
  expect(readBrowserPageDeferredNavigation(target.page)).toMatchObject({
    url: 'https://last.test/'
  })
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 61000)
  expect(readBrowserPageDeferredNavigation(target.page)).toBeNull()
})

for (const change of ['materialized', 'restored', 'not-client-staged'] as const) {
  it(`refuses ${change} handles before queue mutation`, async () => {
    const original = useAppStore.getState().remoteBrowserPageHandlesByPageId[target.page]
    useAppStore.setState({
      remoteBrowserPageHandlesByPageId: {
        [target.page]: {
          ...original,
          ...(change === 'materialized'
            ? { placement }
            : change === 'restored'
              ? { restoredFromSession: true }
              : { stagedClientHosted: undefined })
        }
      }
    })
    await expect(applyBrowserClientDeferredRequest(command, Date.now() + 5000)).rejects.toThrow(
      'target_unavailable'
    )
    expect(readBrowserPageDeferredNavigation(target.page)).toBeNull()
  })
}
for (const value of [
  'file:///private/fixture.html',
  'https://user:password@example.test/',
  'javascript:alert(1)'
]) {
  it('refuses file, credential-bearing and non-web input before calling the staged owner', async () => {
    mountStage()
    await expect(
      applyBrowserClientDeferredRequest({ ...command, value }, Date.now() + 5000)
    ).rejects.toThrow('web_input_required')
    expect(readBrowserPageDeferredNavigation(target.page)).toBeNull()
  })
}

it('invalidates an offered owner when it unmounts before perform', async () => {
  const owner = mountStage()
  const listener = () => owner.unmount()
  window.addEventListener(BROWSER_CLIENT_DEFERRED_EVENT, listener)
  try {
    await act(async () => {
      await expect(applyBrowserClientDeferredRequest(command, Date.now() + 5000)).rejects.toThrow(
        'owner_changed'
      )
    })
  } finally {
    window.removeEventListener(BROWSER_CLIENT_DEFERRED_EVENT, listener)
  }
  expect(readBrowserPageDeferredNavigation(target.page)).toBeNull()
})

it('uses the source identity produced by the actual optimistic client staging writer', async () => {
  useAppStore.setState({
    browserPagesByWorkspace: {},
    browserTabsByWorktree: {},
    activeBrowserTabIdByWorktree: {},
    remoteBrowserPageHandlesByPageId: {}
  })
  const staged = stageWebRuntimeBrowserTab({
    environmentId: target.environmentId,
    worktreeId: target.worktreeId,
    remotePageId: target.page,
    activate: true,
    clientHosted: true
  })
  expect(staged).toMatchObject({ pageId: target.page, clientHosted: true })
  const exact = { ...stagedTarget, remotePageId: target.page }
  expect(useAppStore.getState().remoteBrowserPageHandlesByPageId[target.page]).toMatchObject({
    environmentId: exact.environmentId,
    remotePageId: exact.remotePageId,
    staged: true,
    stagedClientHosted: true
  })
  mountStage()
  let result: unknown
  await act(async () => {
    result = await applyBrowserClientDeferredRequest(
      { ...command, target: exact },
      Date.now() + 5000
    )
  })
  expect(result).toMatchObject({
    clientDeferred: { target: exact, queued: true, hostPlacementKnown: false }
  })
  expect(readBrowserPageDeferredNavigation(target.page)).toMatchObject({ url: command.value })
  expect(guest.loadURL).not.toHaveBeenCalled()
})
