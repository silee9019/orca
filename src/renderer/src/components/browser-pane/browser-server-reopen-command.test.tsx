// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import {
  BrowserServerReopenEvent,
  requestBrowserServerReopen
} from '@/runtime/browser-server-reopen-request'
import {
  pendingCreates,
  hostPages,
  wrapperForRemotePage,
  publishHostSnapshot
} from '@/runtime/web-runtime-browser-creation-placement-test-rig'
import type * as SnapshotModule from '@/runtime/web-runtime-session-snapshot'
import {
  BrowserServerReopenSourceSurface,
  seedBrowserServerReopenOwner
} from './browser-server-reopen.test-fixture'
vi.mock('@/runtime/web-runtime-session', async () => ({
  createWebRuntimeSessionBrowserTab: (await import('@/runtime/web-runtime-browser-creation'))
    .createWebRuntimeSessionBrowserTab
}))
vi.mock('@/runtime/web-runtime-session-snapshot', async (importOriginal) => ({
  ...(await importOriginal<typeof SnapshotModule>()),
  refreshWebRuntimeSessionTabsSnapshot: vi.fn(async () => publishHostSnapshot())
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
const initial = useAppStore.getInitialState()
const originalApi = Object.getOwnPropertyDescriptor(window, 'api')
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  useAppStore.setState(initial, true)
  if (originalApi) {
    Object.defineProperty(window, 'api', originalApi)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})
it('hands actual button staging/unmount to the existing fake-provider creation owner and materialized readback', async () => {
  const { command } = seedBrowserServerReopenOwner()
  render(<BrowserServerReopenSourceSurface />)
  expect(screen.getByRole('button')).not.toBeNull()
  let outcome: ReturnType<typeof requestBrowserServerReopen> | undefined
  await act(async () => {
    outcome = requestBrowserServerReopen(command, Date.now() + 5000)
    void outcome.catch(() => {})
    await Promise.resolve()
  })
  expect(screen.queryByRole('button')).toBeNull()
  expect(pendingCreates).toHaveLength(1)
  expect(pendingCreates[0].params.url).toBe('https://example.com/')
  expect(pendingCreates[0].params.placement).toBeUndefined()
  await act(async () => {
    pendingCreates[0].resolve('fixture-created-server')
    await Promise.resolve()
  })
  expect(await outcome).toMatchObject({
    created: true,
    createdRemotePageId: 'fixture-created-server',
    environmentId: command.environmentId
  })
  expect(
    Object.values(useAppStore.getState().remoteBrowserPageHandlesByPageId).some(
      (handle) => handle.remotePageId === 'fixture-created-server' && !handle.staged
    )
  ).toBe(true)
})

it.each([
  'generation',
  'host',
  'group',
  'expired',
  'modal',
  'staged',
  'restored',
  'legacy'
] as const)('refuses %s before the existing creation provider', async (reason) => {
  const { command, call } = seedBrowserServerReopenOwner()
  render(<BrowserServerReopenSourceSurface />)
  if (reason === 'modal') {
    useAppStore.setState({ activeModal: 'add-repo' })
  }
  if (reason === 'staged' || reason === 'restored' || reason === 'legacy') {
    useAppStore.setState((state) => ({
      remoteBrowserPageHandlesByPageId: {
        ...state.remoteBrowserPageHandlesByPageId,
        [command.page]: {
          environmentId: command.environmentId,
          remotePageId: command.clientTarget.remotePageId,
          ...(reason === 'legacy'
            ? {}
            : {
                placement: {
                  kind: 'client',
                  browserHostClientId: command.clientTarget.browserHostClientId,
                  browserHostGeneration: command.clientTarget.browserHostGeneration,
                  pageHostGeneration: command.clientTarget.pageHostGeneration
                } as const
              }),
          ...(reason === 'staged' ? { staged: true } : {}),
          ...(reason === 'restored' ? { restoredClientHosted: true } : {})
        }
      }
    }))
  }
  const target = {
    ...command,
    ...(reason === 'host' ? { executionHostId: 'ssh:other' as const } : {}),
    ...(reason === 'group' ? { groupId: 'other' } : {}),
    ...(reason === 'generation'
      ? { clientTarget: { ...command.clientTarget, pageHostGeneration: 99 } }
      : {})
  }
  await expect(
    requestBrowserServerReopen(target, Date.now() + (reason === 'expired' ? -1 : 5000))
  ).rejects.toThrow()
  expect(call).not.toHaveBeenCalled()
  expect(pendingCreates).toHaveLength(0)
})
it('rejects a captured owner offer after a workspace ABA before effect', async () => {
  const { command, call } = seedBrowserServerReopenOwner()
  render(<BrowserServerReopenSourceSurface />)
  const event = new BrowserServerReopenEvent(command, Date.now() + 5000)
  window.dispatchEvent(event)
  expect(event.offers).toHaveLength(1)
  useAppStore.setState({ activeWorktreeId: 'folder:other' })
  useAppStore.setState({ activeWorktreeId: command.worktreeId })
  await expect(event.offers[0]()).rejects.toThrow('target_changed')
  expect(call).not.toHaveBeenCalled()
})

it('rejects an unmounted captured offer before handoff', async () => {
  const { command, call } = seedBrowserServerReopenOwner()
  const view = render(<BrowserServerReopenSourceSurface />)
  const event = new BrowserServerReopenEvent(command, Date.now() + 5000)
  window.dispatchEvent(event)
  view.unmount()
  await expect(event.offers[0]()).rejects.toThrow('target_changed')
  expect(call).not.toHaveBeenCalled()
})
it('bounds a handed-off creation and ignores its late successful provider response', async () => {
  const { command } = seedBrowserServerReopenOwner()
  render(<BrowserServerReopenSourceSurface />)
  vi.useFakeTimers()
  let request: ReturnType<typeof requestBrowserServerReopen> | undefined
  await act(async () => {
    request = requestBrowserServerReopen(command, Date.now() + 20)
    void request.catch(() => {})
    await Promise.resolve()
  })
  const outcome = request?.catch((error) => error)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(21)
  })
  expect(await outcome).toMatchObject({ message: 'browser_server_reopen_expired_effect_unknown' })
  await act(async () => {
    pendingCreates[0].resolve('fixture-late-created')
    await Promise.resolve()
  })
  expect(await outcome).toBeInstanceOf(Error)
})

it('keeps one same-act creation across UI and typed duplicate calls', async () => {
  const { command } = seedBrowserServerReopenOwner()
  render(<BrowserServerReopenSourceSurface />)
  const button = screen.getByRole('button')
  let first: ReturnType<typeof requestBrowserServerReopen> | undefined
  let second: Promise<unknown> | undefined
  await act(async () => {
    first = requestBrowserServerReopen(command, Date.now() + 5000)
    void first.catch(() => {})
    fireEvent.click(button)
    second = requestBrowserServerReopen(command, Date.now() + 5000).catch((error) => error)
    await Promise.resolve()
  })
  expect(pendingCreates).toHaveLength(1)
  expect(await second).toBeInstanceOf(Error)
  await act(async () => {
    pendingCreates[0].resolve('fixture-single-created')
    await Promise.resolve()
  })
  expect(await first).toMatchObject({ createdRemotePageId: 'fixture-single-created' })
})
it('rejects a canceled staged creation only after the existing host cleanup and readback', async () => {
  const { command, call } = seedBrowserServerReopenOwner()
  const implementation = call.getMockImplementation()
  if (typeof implementation !== 'function') {
    throw new Error('missing provider')
  }
  let closeSignal = () => {},
    finishClose = () => {}
  const closing = new Promise<void>((resolve) => {
    closeSignal = resolve
  })
  call.mockImplementation((request) => {
    if (request.method !== 'browser.tabClose') {
      return Reflect.apply(implementation, undefined, [request])
    }
    closeSignal()
    return new Promise((resolve) => {
      finishClose = () => {
        const index = hostPages.indexOf(String(request.params.page))
        if (index !== -1) {
          hostPages.splice(index, 1)
        }
        resolve({ id: 'close', ok: true, result: { closed: true } })
      }
    })
  })
  render(<BrowserServerReopenSourceSurface />)
  const result = requestBrowserServerReopen(command, Date.now() + 5000)
  const outcome = result.catch((error) => error)
  let settled = false
  void outcome.then(() => {
    settled = true
  })
  const stagedId = pendingCreates[0].params.page
  if (!stagedId) {
    throw new Error('missing staged page')
  }
  const staged = wrapperForRemotePage(stagedId)
  if (!staged) {
    throw new Error('missing staged workspace')
  }
  await act(async () => {
    useAppStore.setState((state) => ({
      browserTabsByWorktree: {
        ...state.browserTabsByWorktree,
        [command.worktreeId]: state.browserTabsByWorktree[command.worktreeId].filter(
          (workspace) => workspace.id !== staged.entityId
        )
      }
    }))
    pendingCreates[0].resolve('fixture-canceled-created')
    await Promise.resolve()
  })
  await closing
  expect(settled).toBe(false)
  await act(async () => {
    finishClose()
    await Promise.resolve()
  })
  expect(await outcome).toBeInstanceOf(Error)
  expect(hostPages).not.toContain('fixture-canceled-created')
  expect(
    Object.values(useAppStore.getState().remoteBrowserPageHandlesByPageId).some(
      (handle) => handle.remotePageId === 'fixture-canceled-created'
    )
  ).toBe(false)
})

it('refuses materialized receipt after deadline before the timer task runs', async () => {
  const { command } = seedBrowserServerReopenOwner()
  render(<BrowserServerReopenSourceSurface />)
  vi.useFakeTimers()
  let request: ReturnType<typeof requestBrowserServerReopen> | undefined
  await act(async () => {
    request = requestBrowserServerReopen(command, Date.now() + 20)
    void request.catch(() => {})
    await Promise.resolve()
  })
  vi.setSystemTime(Date.now() + 21)
  await act(async () => {
    pendingCreates[0].resolve('fixture-expired-before-timer')
    await Promise.resolve()
  })
  await expect(request).rejects.toThrow('expired_effect_unknown')
})
