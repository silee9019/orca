// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { useRef } from 'react'
import { installClientHostedPaneApi } from '../client-hosted-browser-pane-test-rig'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { getDefaultSettings } from '../../../../../shared/constants'
import { requestBrowserClientHistory } from '@/runtime/browser-client-history-request'
import { useClientHostedNavigationCommands } from './use-client-hosted-navigation-commands'
const initial = useAppStore.getInitialState()
const originalApi = Object.getOwnPropertyDescriptor(window, 'api')
const target = {
  worktreeId: 'folder:history',
  page: 'page',
  environmentId: 'paired',
  remotePageId: 'remote',
  browserHostClientId: 'desktop',
  browserHostGeneration: 3,
  pageHostGeneration: 4
}
const placement = {
  kind: 'client' as const,
  browserHostClientId: 'desktop',
  browserHostGeneration: 3,
  pageHostGeneration: 4
}
let index = 1
let loading = false
const urls = ['https://first.test/', 'https://second.test/']
const back = vi.fn(() => {
  index -= 1
})
const forward = vi.fn(() => {
  index += 1
})
const guest = {
  getURL: () => urls[index],
  getTitle: () => 'History',
  isLoading: () => loading,
  canGoBack: () => index > 0,
  canGoForward: () => index < urls.length - 1,
  goBack: back,
  goForward: forward
}
function Owner({ active = true, page = target.page }: { active?: boolean; page?: string }) {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: This fake supplies only the guest metadata/history methods exercised by the mounted navigation owner; no Electron guest exists.
  const webviewRef = useRef(guest as unknown as Electron.WebviewTag)
  useClientHostedNavigationCommands({
    page,
    worktreeId: target.worktreeId,
    environmentId: target.environmentId,
    placement,
    isActive: active,
    unavailable: false,
    webviewRef,
    navigationVersionRef: useRef(0),
    publishCurrentRef: useRef(null),
    navigate: vi.fn()
  })
  return null
}
function request(
  action: 'back' | 'forward' = 'back',
  expiry = Date.now() + 2000,
  selected = target
) {
  return requestBrowserClientHistory(
    { viewer: 'host', operation: 'client-history', target: selected, action },
    expiry
  )
}
beforeEach(() => {
  installClientHostedPaneApi()
  index = 1
  loading = false
  back.mockReset().mockImplementation(() => {
    index -= 1
  })
  forward.mockReset().mockImplementation(() => {
    index += 1
  })
  useAppStore.setState({
    settings: getDefaultSettings('/fixture'),
    persistedUIReady: true,
    activeModal: 'none',
    activeWorktreeId: target.worktreeId
  })
  useAppStore
    .getState()
    .createBrowserTab(target.worktreeId, urls[index], { browserPageId: target.page })
  useAppStore.setState((state) => ({
    browserPagesByWorkspace: Object.fromEntries(
      Object.entries(state.browserPagesByWorkspace).map(([id, pages]) => [
        id,
        pages.map((page) => ({ ...page, browserRuntimeEnvironmentId: target.environmentId }))
      ])
    )
  }))
  useAppStore.setState({
    settings: {
      ...getDefaultSettings('/fixture'),
      activeRuntimeEnvironmentId: target.environmentId
    },
    remoteBrowserPageHandlesByPageId: {
      [target.page]: {
        environmentId: target.environmentId,
        remotePageId: target.remotePageId,
        placement
      }
    }
  })
})
afterEach(() => {
  cleanup()
  useAppStore.setState(initial, true)
  vi.restoreAllMocks()
  if (originalApi) {
    Object.defineProperty(window, 'api', originalApi)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})
it('reuses the mounted navigation owner guest and reads fake history without claiming completion', async () => {
  render(<Owner />)
  await expect(request()).resolves.toMatchObject({
    target,
    action: 'back',
    accepted: true,
    completionObserved: false,
    observedUrl: urls[0]
  })
  expect(index).toBe(0)
  await expect(request('forward')).resolves.toMatchObject({
    observedUrl: urls[1],
    completionObserved: false
  })
  expect(back).toHaveBeenCalledTimes(1)
  expect(forward).toHaveBeenCalledTimes(1)
})
it('refuses exhausted history, inactive/missing owners, wrong generation/host and deadline', async () => {
  const view = render(<Owner />)
  await expect(request('forward')).rejects.toThrow('history_unavailable')
  await expect(request('back', Date.now() - 1)).rejects.toThrow('request_expired')
  await expect(
    request('back', Date.now() + 2000, { ...target, pageHostGeneration: 5 })
  ).rejects.toThrow('target_unavailable')
  await expect(
    request('back', Date.now() + 2000, { ...target, browserHostClientId: 'other' })
  ).rejects.toThrow('target_unavailable')
  view.rerender(<Owner active={false} />)
  await expect(request()).rejects.toThrow('owner_unavailable')
  view.unmount()
  await expect(request()).rejects.toThrow('owner_unavailable')
  expect(back).not.toHaveBeenCalled()
  expect(forward).not.toHaveBeenCalled()
})
it('latches store ABA and exact deadline during the original guest method', async () => {
  render(<Owner />)
  back.mockImplementation(() => {
    useAppStore.setState({ activeWorktreeId: 'other' })
    useAppStore.setState({ activeWorktreeId: target.worktreeId })
    index = 0
  })
  await expect(request()).rejects.toThrow('owner_changed_effect_unknown')
  index = 1
  back.mockImplementation(() => {
    index = 0
    vi.spyOn(Date, 'now').mockReturnValue(5000)
  })
  vi.spyOn(Date, 'now').mockReturnValue(1000)
  await expect(request('back', 2000)).rejects.toThrow('request_expired')
})
it('rejects reentrant duplicates and prop replacement before acceptance', async () => {
  const view = render(<Owner />)
  let duplicate: Promise<unknown> | undefined
  back.mockImplementation(() => {
    duplicate = request()
    index = 0
  })
  await request()
  await expect(duplicate).rejects.toThrow('owner_unavailable')
  act(() => view.rerender(<Owner page="other" />))
  await expect(request()).rejects.toThrow('owner_unavailable')
})

it('refuses ambiguous owners before calling either guest', async () => {
  render(
    <>
      <Owner />
      <Owner />
    </>
  )
  await expect(request()).rejects.toThrow('owner_unavailable_or_ambiguous')
  expect(back).not.toHaveBeenCalled()
})

it('accepts the existing guest back effect while loading with available history', async () => {
  loading = true
  render(<Owner />)
  await expect(request()).resolves.toMatchObject({
    accepted: true,
    completionObserved: false,
    observedUrl: urls[0],
    loading: true
  })
  expect(back).toHaveBeenCalledTimes(1)
  expect(index).toBe(0)
})
