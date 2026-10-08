// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { getDefaultSettings } from '../../src/shared/constants'
import { releaseBrowserPageMount } from '../../src/renderer/src/components/browser-pane/host-guest/browser-page-mount-admission'
import { registerBrowserStateIpcBridge } from '../../src/renderer/src/hooks/ipc-events/browser-state-ipc-bridge'
import { browserPageInteractionAndSessionsApi } from '../../src/preload/api/browser-bridge-page-interaction-and-sessions'
import { browserGuestRegistrationAndDownloadsApi } from '../../src/preload/api/browser-bridge-guest-registration-and-downloads'

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  return { ipcRenderer: Object.assign(new EventEmitter(), { invoke: vi.fn(async () => true) }) }
})
vi.mock('../../src/preload/preload-runtime-support', () => ({
  browserClientPageRendererRequests: { subscribe: () => () => {} }
}))
import { ipcRenderer } from 'electron'
const originalApi = Object.getOwnPropertyDescriptor(window, 'api')
let originalStore = useAppStore.getState()
let remoteActive = false
const releases: (() => void)[] = []
const worktree = 'folder:ipc-owner'
beforeEach(() => {
  originalStore = useAppStore.getState()
  remoteActive = false
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      browser: {
        ...browserGuestRegistrationAndDownloadsApi,
        ...browserPageInteractionAndSessionsApi
      },
      ui: { onFullscreenChanged: () => () => {}, set: vi.fn(async () => {}) }
    }
  })
  useAppStore.setState({
    settings: getDefaultSettings('/fake-profile'),
    activeView: 'terminal',
    activeModal: 'none',
    persistedUIReady: true,
    activeWorktreeId: worktree,
    browserTabsByWorktree: {},
    browserPagesByWorkspace: {},
    unifiedTabsByWorktree: {},
    groupsByWorktree: {},
    browserCertificateFailuresByPageId: {},
    remoteBrowserPageHandlesByPageId: {}
  })
  useAppStore.getState().createBrowserTab(worktree, 'https://fake.example/start', {
    browserPageId: 'ipc-page-a',
    sessionProfileId: 'fake-isolated',
    sessionPartition: 'persist:fake-isolated'
  })
  registerBrowserStateIpcBridge(releases, () => remoteActive)
})
afterEach(() => {
  for (const release of releases.splice(0).toReversed()) {
    release()
  }
  expect(ipcRenderer.listenerCount('browser:certificate-failure-changed')).toBe(0)
  expect(ipcRenderer.listenerCount('browser:guest-load-failed')).toBe(0)
  expect(ipcRenderer.listenerCount('browser:pane-focus')).toBe(0)
  expect(ipcRenderer.listenerCount('browser:open-link-in-orca-tab')).toBe(0)
  const previousPageIds = new Set(
    Object.values(originalStore.browserPagesByWorkspace)
      .flat()
      .map((page) => page.id)
  )
  for (const page of Object.values(useAppStore.getState().browserPagesByWorkspace).flat()) {
    if (!previousPageIds.has(page.id)) {
      releaseBrowserPageMount(page.id)
    }
  }
  useAppStore.setState(originalStore, true)
  expect(useAppStore.getState()).toBe(originalStore)
  if (originalApi) {
    Object.defineProperty(window, 'api', originalApi)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})
const failure = {
  browserPageId: 'ipc-page-a',
  challengeId: 'fake-challenge',
  origin: 'https://fake.example',
  error: 'ERR_CERT_AUTHORITY_INVALID',
  errorCode: -202,
  canProceed: true
}
it('delivers certificate state through the actual preload and store, preserving remote ownership and removal', () => {
  remoteActive = true
  ipcRenderer.emit(
    'browser:certificate-failure-changed',
    {},
    { browserPageId: 'ipc-page-a', failure }
  )
  expect(useAppStore.getState().browserCertificateFailuresByPageId['ipc-page-a']).toBeUndefined()
  useAppStore.setState({
    remoteBrowserPageHandlesByPageId: {
      'ipc-page-a': {
        environmentId: 'fake-remote',
        remotePageId: 'remote-page',
        placement: {
          kind: 'client',
          browserHostClientId: 'fake-host',
          browserHostGeneration: 1,
          pageHostGeneration: 1
        }
      }
    }
  })
  ipcRenderer.emit(
    'browser:certificate-failure-changed',
    {},
    { browserPageId: 'ipc-page-a', failure }
  )
  expect(useAppStore.getState().browserCertificateFailuresByPageId['ipc-page-a']).toEqual(failure)
  ipcRenderer.emit(
    'browser:certificate-failure-changed',
    {},
    { browserPageId: 'ipc-page-a', failure: null }
  )
  expect(useAppStore.getState().browserCertificateFailuresByPageId['ipc-page-a']).toBeUndefined()
})
it('delivers guest failure into the actual page state and refuses the remote-owned event', () => {
  const tab = useAppStore.getState().browserTabsByWorktree[worktree][0]
  const loadError = {
    code: -105,
    description: 'fake unreachable',
    validatedUrl: 'https://fake.example/start'
  }
  remoteActive = true
  ipcRenderer.emit('browser:guest-load-failed', {}, { browserPageId: 'ipc-page-a', loadError })
  expect(useAppStore.getState().browserPagesByWorkspace[tab.id][0].loadError).toBeNull()
  remoteActive = false
  ipcRenderer.emit('browser:guest-load-failed', {}, { browserPageId: 'ipc-page-a', loadError })
  expect(useAppStore.getState().browserPagesByWorkspace[tab.id][0]).toMatchObject({
    loading: false,
    loadError,
    canGoBack: false,
    canGoForward: false
  })
})
it('focuses the exact actual workspace from a page event without native focus or cross-worktree mutation', () => {
  const a = useAppStore.getState().browserTabsByWorktree[worktree][0]
  const b = useAppStore
    .getState()
    .createBrowserTab(worktree, 'https://fake.example/other', { browserPageId: 'ipc-page-b' })
  expect(useAppStore.getState().activeBrowserTabId).toBe(b.id)
  remoteActive = true
  ipcRenderer.emit('browser:pane-focus', {}, { worktreeId: worktree, browserPageId: 'ipc-page-a' })
  expect(useAppStore.getState().activeBrowserTabId).toBe(b.id)
  remoteActive = false
  ipcRenderer.emit(
    'browser:pane-focus',
    {},
    { worktreeId: 'folder:other', browserPageId: 'ipc-page-a' }
  )
  expect(useAppStore.getState().activeBrowserTabId).toBe(b.id)
  ipcRenderer.emit('browser:pane-focus', {}, { worktreeId: null, browserPageId: 'ipc-page-a' })
  expect(useAppStore.getState().activeBrowserTabId).toBe(a.id)
  expect(useAppStore.getState().activeBrowserTabIdByWorktree[worktree]).toBe(a.id)
  expect(useAppStore.getState().activeTabType).toBe('browser')
})
it('creates an actual background link tab with inherited profile, partition and insertion target', () => {
  const state = useAppStore.getState()
  const a = state.browserTabsByWorktree[worktree][0]
  const source = state.unifiedTabsByWorktree[worktree].find((entry) => entry.entityId === a.id)
  ipcRenderer.emit(
    'browser:open-link-in-orca-tab',
    {},
    { browserPageId: 'missing', url: 'https://fake.example/ignored' }
  )
  expect(useAppStore.getState().browserTabsByWorktree[worktree]).toHaveLength(1)
  ipcRenderer.emit(
    'browser:open-link-in-orca-tab',
    {},
    { browserPageId: 'ipc-page-a', url: 'https://fake.example/link', activate: false }
  )
  const next = useAppStore.getState()
  expect(next.browserTabsByWorktree[worktree]).toHaveLength(2)
  const created = next.browserTabsByWorktree[worktree][1]
  expect(created).toMatchObject({
    sessionProfileId: 'fake-isolated',
    sessionPartition: 'persist:fake-isolated',
    url: 'https://fake.example/link'
  })
  expect(next.activeBrowserTabId).toBe(a.id)
  const destination = next.unifiedTabsByWorktree[worktree].find(
    (entry) => entry.entityId === created.id
  )
  const group = next.groupsByWorktree[worktree].find((entry) => entry.id === source?.groupId)
  expect(destination?.groupId).toBe(source?.groupId)
  expect(group?.tabOrder).toEqual([source?.id, destination?.id])
})
