// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { getDefaultSettings } from '../../../../../shared/constants'
import { applyBrowserViewerRequest } from '@/runtime/browser-viewer-bridge'
import { requestBrowserSshRoute } from '@/runtime/browser-ssh-route-request'
import type { BrowserSshRouteTarget } from '../../../../../shared/rpc-contract/browser-ssh-route-params'
const provider = vi.hoisted(() => ({ prepare: vi.fn(), destroy: vi.fn(), save: vi.fn() }))
vi.mock('@/lib/worktree-runtime-owner', () => ({
  getExecutionHostIdForWorktree: () => 'ssh:target'
}))
vi.mock('@/lib/worktree-host-connection-phase', () => ({
  useWorktreeHostConnection: () => ({
    phase: 'connected',
    targetId: 'target',
    connectedEpoch: 'target:1'
  })
}))
vi.mock('../host-guest/webview-registry', () => ({ destroyPersistentWebview: provider.destroy }))
import { SshRoutedBrowserPageGate } from './ssh-routed-browser-page-gate'
const initial = useAppStore.getInitialState()
const api = Object.getOwnPropertyDescriptor(window, 'api')
const target: BrowserSshRouteTarget = {
  worktreeId: 'folder:fixture',
  page: 'page',
  targetId: 'target',
  profileId: 'default',
  errorKind: 'forwarding-blocked',
  action: 'retry'
}
beforeEach(() => {
  provider.prepare
    .mockReset()
    .mockRejectedValue(new Error('browser_local_route_forwarding_blocked'))
  provider.destroy.mockReset()
  provider.save
    .mockReset()
    .mockImplementation(async (updates: Partial<ReturnType<typeof getDefaultSettings>>) => ({
      ...useAppStore.getState().settings,
      ...updates
    }))
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      browser: { prepareSshWorkspacePartition: provider.prepare },
      ui: { set: async () => {} },
      settings: { set: provider.save }
    }
  })
  useAppStore.setState({
    settings: getDefaultSettings('/fixture'),
    persistedUIReady: true,
    activeWorktreeId: target.worktreeId
  })
  useAppStore
    .getState()
    .createBrowserTab(target.worktreeId, 'http://localhost/', { browserPageId: 'page' })
})
afterEach(() => {
  cleanup()
  useAppStore.setState(initial, true)
  if (api) {
    Object.defineProperty(window, 'api', api)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})
function Gate() {
  return (
    <SshRoutedBrowserPageGate
      worktreeId={target.worktreeId}
      sessionProfileId={null}
      pageIds={['page']}
    >
      {(partition) => <div data-testid="routed-page">{partition ?? 'local'}</div>}
    </SshRoutedBrowserPageGate>
  )
}
async function mount() {
  render(<Gate />)
  await act(async () => {})
  expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
}
it('uses the actual routing gate Retry and observes its next prepare attempt', async () => {
  await mount()
  provider.prepare.mockResolvedValue({ partition: 'persist:routed' })
  let result: ReturnType<typeof applyBrowserViewerRequest> | undefined
  await act(async () => {
    result = applyBrowserViewerRequest({
      id: 'route-fixture',
      expiresAt: Date.now() + 5000,
      command: { viewer: 'host', operation: 'ssh-route', target }
    })
    void result.catch(() => {})
  })
  await expect(result).resolves.toMatchObject({
    applied: true,
    persisted: false,
    rendered: false,
    sshRoute: { accepted: true, action: 'retry', attempt: 1 }
  })
  expect(provider.prepare).toHaveBeenCalledTimes(2)
  expect(provider.prepare).toHaveBeenLastCalledWith({
    targetId: 'target',
    browserProfileId: 'default'
  })
  expect(screen.getByTestId('routed-page').textContent).toBe('persist:routed')
})
it('refuses wrong targets and duplicate gates before preparing another route', async () => {
  await mount()
  await expect(
    requestBrowserSshRoute({ ...target, targetId: 'other' }, Date.now() + 5000)
  ).rejects.toThrow('owner')
  render(<Gate />)
  await act(async () => {})
  const count = provider.prepare.mock.calls.length
  await expect(requestBrowserSshRoute(target, Date.now() + 5000)).rejects.toThrow('ambiguous')
  expect(provider.prepare).toHaveBeenCalledTimes(count)
})

it.each(['try-without-probe', 'browse-local'] as const)(
  'reuses the routing gate %s callback and observes its target policy',
  async (action) => {
    await mount()
    provider.prepare.mockResolvedValue({ partition: 'persist:routed' })
    let result: ReturnType<typeof requestBrowserSshRoute> | undefined
    await act(async () => {
      result = requestBrowserSshRoute({ ...target, action }, Date.now() + 5000)
      void result.catch(() => {})
    })
    await expect(result).resolves.toMatchObject({ accepted: true, action })
    if (action === 'try-without-probe') {
      expect(provider.save).toHaveBeenCalledExactlyOnceWith({
        browserSshWorkspaceRoutingProbeSkippedTargetIds: ['target']
      })
      expect(provider.prepare).toHaveBeenLastCalledWith({
        targetId: 'target',
        browserProfileId: 'default',
        skipProbe: true
      })
    } else {
      expect(provider.save).toHaveBeenCalledExactlyOnceWith({
        browserSshWorkspaceRoutingDisabledTargetIds: ['target']
      })
      expect(screen.getByTestId('routed-page').textContent).toBe('local')
      expect(provider.prepare).toHaveBeenCalledOnce()
    }
  }
)
it('refuses expired, inactive, modal, mismatched profile and stale error requests without a new prepare', async () => {
  await mount()
  const count = provider.prepare.mock.calls.length
  await expect(requestBrowserSshRoute(target, Date.now() - 1)).rejects.toThrow('state_changed')
  await expect(
    requestBrowserSshRoute({ ...target, profileId: 'other' }, Date.now() + 5000)
  ).rejects.toThrow('owner')
  await expect(
    requestBrowserSshRoute({ ...target, errorKind: 'unknown' }, Date.now() + 5000)
  ).rejects.toThrow('state_changed')
  useAppStore.setState({ activeModal: 'add-repo' })
  await expect(requestBrowserSshRoute(target, Date.now() + 5000)).rejects.toThrow('owner')
  useAppStore.setState({ activeModal: 'none', activeWorktreeId: 'other' })
  await expect(requestBrowserSshRoute(target, Date.now() + 5000)).rejects.toThrow('owner')
  expect(provider.prepare).toHaveBeenCalledTimes(count)
})

it('does not acknowledge a probe policy callback without committed settings and clears pending on expiry', async () => {
  await mount()
  provider.save.mockResolvedValue(undefined)
  provider.prepare.mockResolvedValue({ partition: 'persist:routed' })
  vi.useFakeTimers()
  try {
    let result: ReturnType<typeof requestBrowserSshRoute> | undefined
    await act(async () => {
      result = requestBrowserSshRoute({ ...target, action: 'try-without-probe' }, Date.now() + 100)
      void result.catch(() => {})
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(101)
    })
    await expect(result).rejects.toThrow('expired_effect_unknown')
    expect(
      useAppStore.getState().settings?.browserSshWorkspaceRoutingProbeSkippedTargetIds ?? []
    ).not.toContain('target')
  } finally {
    vi.useRealTimers()
  }
})
