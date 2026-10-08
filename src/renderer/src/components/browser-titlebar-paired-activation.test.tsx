// @vitest-environment happy-dom
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { clearHostSessionTabIdMappings } from '@/runtime/web-session-tabs-sync/tracking-mappings'
import { activateWebRuntimeSessionTab } from '@/runtime/web-runtime-session-tab-lifecycle'
import { requestBrowserTitlebarPairedActivation } from '@/runtime/browser-titlebar-paired-activation-request'
import {
  PairedTitlebarFixture,
  seedPairedTitlebarTarget,
  clearPairedTitlebarTarget,
  pairedTitlebarAcknowledgment,
  titlebarWorktree,
  titlebarEnvironment
} from './browser-titlebar-paired-activation.test-fixture'
vi.mock('./tab-bar/TabBar', () => ({ default: () => null }))
const initial = useAppStore.getInitialState()
const api = Object.getOwnPropertyDescriptor(window, 'api')
let target: ReturnType<typeof seedPairedTitlebarTarget>
let portal: HTMLElement
const call = vi.fn(async (_args: unknown): Promise<unknown> => ({
  id: 'host',
  ok: true,
  result: pairedTitlebarAcknowledgment()
}))
const request = (selected = target, expiry = Date.now() + 15_000) =>
  requestBrowserTitlebarPairedActivation(selected, expiry)
beforeEach(() => {
  target = seedPairedTitlebarTarget()
  portal = document.createElement('div')
  document.body.append(portal)
  call.mockReset().mockImplementation(async () => ({
    id: 'host',
    ok: true,
    result: pairedTitlebarAcknowledgment()
  }))
  Reflect.set(window.api, 'runtimeEnvironments', { call })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  portal.remove()
  clearPairedTitlebarTarget()
  useAppStore.setState(initial, true)
  vi.restoreAllMocks()
  if (api) {
    Object.defineProperty(window, 'api', api)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})
it('reuses actual titlebar/controller activation once and requires caller-scoped host acknowledgment plus Store selection', async () => {
  render(<PairedTitlebarFixture portal={portal} />)
  await act(async () => {
    await expect(request()).resolves.toMatchObject({
      target,
      hostAcknowledged: true,
      callerNavigation: true,
      activeWorkspace: target.workspace,
      activeTab: target.unifiedTab,
      nativeWindowVerified: false
    })
  })
  expect(call).toHaveBeenCalledTimes(1)
  expect(call).toHaveBeenCalledWith(
    expect.objectContaining({
      selector: titlebarEnvironment,
      expectedEnvironmentPairingRevision: 7,
      method: 'session.tabs.activate',
      params: {
        worktree: `id:${titlebarWorktree}`,
        tabId: 'host-tab',
        notifyClients: false,
        navigation: 'caller',
        intent: 'user'
      }
    })
  )
  expect(useAppStore.getState().activeBrowserTabIdByWorktree[titlebarWorktree]).toBe(
    target.workspace
  )
})
it.each([
  undefined,
  null,
  {},
  { ...pairedTitlebarAcknowledgment(), activeTabId: 'other' },
  { ...pairedTitlebarAcknowledgment(), activeTabType: 'terminal' }
])('rejects missing or mismatched host snapshot acknowledgment %#', async (result) => {
  call.mockResolvedValue({ id: 'host', ok: true, result })
  render(<PairedTitlebarFixture portal={portal} />)
  await act(async () => {
    await expect(request()).rejects.toThrow('unacknowledged')
  })
})
it('refuses wrong host/generation/revision and staged target before activation', async () => {
  render(<PairedTitlebarFixture portal={portal} />)
  await expect(request({ ...target, executionHostId: 'local' })).rejects.toThrow('owner_changed')
  await expect(request({ ...target, pairingRevision: 8 })).rejects.toThrow('owner_changed')
  await expect(request({ ...target, remotePageId: 'other' })).rejects.toThrow('owner_changed')
  useAppStore.setState((state) => ({
    remoteBrowserPageHandlesByPageId: {
      ...state.remoteBrowserPageHandlesByPageId,
      [target.page]: { ...state.remoteBrowserPageHandlesByPageId[target.page], staged: true }
    }
  }))
  await expect(request()).rejects.toThrow('owner_changed')
  expect(call).not.toHaveBeenCalled()
})
it('rejects busy and held Store ABA without accepting a late host reply', async () => {
  let release: (() => void) | undefined
  call.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = () => resolve({ id: 'host', ok: true, result: pairedTitlebarAcknowledgment() })
      })
  )
  render(<PairedTitlebarFixture portal={portal} />)
  const pending = request()
  const rejected = expect(pending).rejects.toThrow('owner_changed')
  await expect(request()).rejects.toThrow('busy')
  await waitFor(() => expect(call).toHaveBeenCalledTimes(1))
  act(() => {
    useAppStore.setState({ activeWorktreeId: 'other' })
    useAppStore.setState({ activeWorktreeId: titlebarWorktree })
  })
  await rejected
  await act(async () => {
    release?.()
    await Promise.resolve()
  })
  expect(call).toHaveBeenCalledTimes(1)
})
it('rejects a held request on owner unmount', async () => {
  let release: (() => void) | undefined
  call.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = () => resolve({ id: 'host', ok: true, result: pairedTitlebarAcknowledgment() })
      })
  )
  const view = render(<PairedTitlebarFixture portal={portal} />)
  const pending = request()
  const rejected = expect(pending).rejects.toThrow('unmounted')
  await waitFor(() => expect(call).toHaveBeenCalledTimes(1))
  view.unmount()
  await rejected
  release?.()
  await Promise.resolve()
})

it('rejects an expired acknowledgment before a timer can dispatch', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(1000)
  let release: (() => void) | undefined
  call.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = () => resolve({ id: 'host', ok: true, result: pairedTitlebarAcknowledgment() })
      })
  )
  render(<PairedTitlebarFixture portal={portal} />)
  const pending = request(target, 2000)
  const rejected = expect(pending).rejects.toThrow('expired')
  await waitFor(() => expect(call).toHaveBeenCalledTimes(1))
  vi.mocked(Date.now).mockReturnValue(3000)
  await act(async () => {
    release?.()
    await Promise.resolve()
  })
  await rejected
})

it('rejects a Store ABA before asynchronous host dispatch with zero provider calls', async () => {
  render(<PairedTitlebarFixture portal={portal} />)
  const pending = request()
  const rejected = expect(pending).rejects.toThrow('owner_changed')
  act(() => {
    useAppStore.setState({ activeWorktreeId: 'other' })
    useAppStore.setState({ activeWorktreeId: titlebarWorktree })
  })
  await rejected
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  expect(call).not.toHaveBeenCalled()
})
it('checks client placement generations and rejects a replacement before effect', async () => {
  const placement = {
    kind: 'client' as const,
    browserHostClientId: 'client',
    browserHostGeneration: 3,
    pageHostGeneration: 4
  }
  useAppStore.setState((state) => ({
    remoteBrowserPageHandlesByPageId: {
      ...state.remoteBrowserPageHandlesByPageId,
      [target.page]: { ...state.remoteBrowserPageHandlesByPageId[target.page], placement }
    }
  }))
  target = { ...target, placement }
  render(<PairedTitlebarFixture portal={portal} />)
  await expect(
    request({ ...target, placement: { ...placement, pageHostGeneration: 5 } })
  ).rejects.toThrow('owner_changed')
  expect(call).not.toHaveBeenCalled()
  await act(async () => {
    await expect(request()).resolves.toMatchObject({ hostAcknowledged: true })
  })
  expect(call).toHaveBeenCalledTimes(1)
})

it('preserves the legacy UI helper result while strict command activation rejects missing acknowledgment', async () => {
  call.mockResolvedValue({ id: 'host', ok: true, result: undefined })
  await expect(
    activateWebRuntimeSessionTab({
      worktreeId: titlebarWorktree,
      tabId: target.workspace,
      environmentId: titlebarEnvironment
    })
  ).resolves.toBe(true)
  await expect(
    activateWebRuntimeSessionTab({
      worktreeId: titlebarWorktree,
      tabId: target.workspace,
      environmentId: titlebarEnvironment,
      requireAcknowledgedActivation: true,
      expectedHostTabId: 'host-tab'
    })
  ).resolves.toBe(false)
})

it('rejects an unmapped local workspace even when a host could acknowledge the same spelling', async () => {
  clearHostSessionTabIdMappings(titlebarEnvironment, titlebarWorktree)
  target = { ...target, hostTabId: target.workspace }
  call.mockResolvedValue({
    id: 'host',
    ok: true,
    result: {
      ...pairedTitlebarAcknowledgment(),
      activeTabId: target.workspace,
      tabs: [{ id: target.workspace, type: 'browser', isActive: true }]
    }
  })
  render(<PairedTitlebarFixture portal={portal} />)
  await act(async () => {
    await expect(request()).rejects.toThrow('owner_changed')
  })
  expect(call).not.toHaveBeenCalled()
})
it('requires authoritative mapping in strict lifecycle while preserving legacy UI fallback', async () => {
  clearHostSessionTabIdMappings(titlebarEnvironment, titlebarWorktree)
  call.mockResolvedValue({
    id: 'host',
    ok: true,
    result: {
      ...pairedTitlebarAcknowledgment(),
      activeTabId: target.workspace,
      tabs: [{ id: target.workspace, type: 'browser', isActive: true }]
    }
  })
  await expect(
    activateWebRuntimeSessionTab({
      worktreeId: titlebarWorktree,
      tabId: target.workspace,
      environmentId: titlebarEnvironment,
      requireAcknowledgedActivation: true,
      expectedHostTabId: target.workspace
    })
  ).resolves.toBe(false)
  expect(call).not.toHaveBeenCalled()
  await expect(
    activateWebRuntimeSessionTab({
      worktreeId: titlebarWorktree,
      tabId: target.workspace,
      environmentId: titlebarEnvironment
    })
  ).resolves.toBe(true)
  expect(call).toHaveBeenCalledTimes(1)
  expect(call).toHaveBeenCalledWith(
    expect.objectContaining({ params: expect.objectContaining({ tabId: target.workspace }) })
  )
})
