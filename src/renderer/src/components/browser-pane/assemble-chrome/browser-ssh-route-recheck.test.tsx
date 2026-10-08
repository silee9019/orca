// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { getDefaultSettings } from '../../../../../shared/constants'
import { applyBrowserViewerRequest } from '@/runtime/browser-viewer-bridge'
import { requestBrowserSshRoute } from '@/runtime/browser-ssh-route-request'
import { SshRoutedBrowserPageGate } from './ssh-routed-browser-page-gate'
import { BrowserSshRouteRecheckFixture } from './browser-ssh-route-recheck.test-fixture'
const provider = vi.hoisted(() => ({ prepare: vi.fn(), save: vi.fn(), destroy: vi.fn() }))
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
const initial = useAppStore.getInitialState()
const api = Object.getOwnPropertyDescriptor(window, 'api')
const target = {
  worktreeId: 'folder:fixture',
  page: 'page',
  targetId: 'target',
  profileId: 'default',
  action: 'recheck',
  errorCode: -105,
  expectedUrl: 'http://localhost/'
} as const
beforeEach(() => {
  provider.prepare.mockReset().mockResolvedValue({ partition: 'persist:routed' })
  provider.save
    .mockReset()
    .mockImplementation(async (updates: Partial<ReturnType<typeof getDefaultSettings>>) => ({
      ...useAppStore.getState().settings,
      ...updates
    }))
  provider.destroy.mockReset()
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      browser: { prepareSshWorkspacePartition: provider.prepare },
      ui: { set: async () => {} },
      settings: { set: provider.save }
    }
  })
  useAppStore.setState({
    settings: {
      ...getDefaultSettings('/fixture'),
      browserSshWorkspaceRoutingProbeSkippedTargetIds: ['target', 'other']
    },
    persistedUIReady: true,
    activeWorktreeId: target.worktreeId
  })
  useAppStore
    .getState()
    .createBrowserTab(target.worktreeId, target.expectedUrl, { browserPageId: target.page })
  useAppStore.getState().updateBrowserPageState(target.page, {
    loading: false,
    loadError: {
      code: target.errorCode,
      validatedUrl: target.expectedUrl,
      description: 'ERR_NAME_NOT_RESOLVED'
    }
  })
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
async function mount() {
  render(
    <SshRoutedBrowserPageGate
      worktreeId={target.worktreeId}
      sessionProfileId={null}
      pageIds={[target.page]}
    >
      {() => <BrowserSshRouteRecheckFixture notice={() => {}} />}
    </SshRoutedBrowserPageGate>
  )
  await act(async () => {})
  expect(screen.getByTestId('browser-load-failure-recheck-ssh-route')).toBeTruthy()
}
it.each(['ui', 'cli'] as const)(
  'reuses the visible failure recheck owner through %s and observes removal of only its probe skip policy',
  async (mode) => {
    await mount()
    if (mode === 'ui') {
      await act(async () => {
        screen.getByTestId('browser-load-failure-recheck-ssh-route').click()
      })
    } else {
      let result: ReturnType<typeof applyBrowserViewerRequest> | undefined
      await act(async () => {
        result = applyBrowserViewerRequest({
          id: 'recheck-fixture',
          expiresAt: Date.now() + 5000,
          command: { viewer: 'host', operation: 'ssh-route', target }
        })
        void result.catch(() => {})
      })
      await expect(result).resolves.toMatchObject({
        applied: true,
        rendered: false,
        persisted: false,
        sshRoute: { accepted: true, action: 'recheck' }
      })
    }
    expect(provider.save).toHaveBeenCalledExactlyOnceWith({
      browserSshWorkspaceRoutingProbeSkippedTargetIds: ['other']
    })
    expect(provider.prepare).toHaveBeenLastCalledWith({
      targetId: 'target',
      browserProfileId: 'default'
    })
    expect(screen.queryByTestId('browser-load-failure-recheck-ssh-route')).toBeNull()
  }
)
it('refuses a different failure generation before changing SSH policy', async () => {
  await mount()
  await expect(
    requestBrowserSshRoute({ ...target, errorCode: -106 }, Date.now() + 5000)
  ).rejects.toThrow('state_changed')
  await expect(
    requestBrowserSshRoute(
      { ...target, expectedUrl: 'http://elsewhere.invalid/' },
      Date.now() + 5000
    )
  ).rejects.toThrow('state_changed')
  expect(provider.save).not.toHaveBeenCalled()
})

it.each(['code', 'url', 'description'] as const)(
  'refuses stale recheck completion when the failed page %s changes while settings save is pending',
  async (field) => {
    await mount()
    let complete: ((value: ReturnType<typeof getDefaultSettings>) => void) | undefined
    provider.save.mockImplementation(
      () =>
        new Promise<ReturnType<typeof getDefaultSettings>>((resolve) => {
          complete = resolve
        })
    )
    let result: ReturnType<typeof requestBrowserSshRoute> | undefined
    await act(async () => {
      result = requestBrowserSshRoute(target, Date.now() + 5000)
      void result.catch(() => {})
    })
    const error = {
      code: field === 'code' ? -106 : target.errorCode,
      validatedUrl: field === 'url' ? 'http://other.invalid/' : target.expectedUrl,
      description: 'replacement failure'
    }
    await act(async () => {
      useAppStore.getState().updateBrowserPageState(target.page, { loadError: error })
    })
    const settings = useAppStore.getState().settings
    if (!settings || !complete) {
      throw new Error('Missing held settings reply')
    }
    await act(async () => {
      complete?.({ ...settings, browserSshWorkspaceRoutingProbeSkippedTargetIds: ['other'] })
    })
    await expect(result).rejects.toThrow('owner_changed_effect_unknown')
    expect(provider.save).toHaveBeenCalledOnce()
  }
)
