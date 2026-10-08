// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { applyBrowserViewerRequest } from '@/runtime/browser-viewer-bridge'
import { getDefaultSettings } from '../../../../../shared/constants'
import type { BrowserViewerResult } from '../../../../../shared/browser-viewer-command'
import { installClientHostedPaneApi } from '../client-hosted-browser-pane-test-rig'
import { useClientHostedBrowserMarkup } from './use-client-hosted-browser-markup'
const fixture = vi.hoisted(() => ({
  capture: vi.fn(),
  compose: vi.fn(),
  write: vi.fn(),
  success: vi.fn()
}))
vi.mock('./markup-base-image', () => ({ captureMarkupBaseImage: fixture.capture }))
vi.mock(import('./markup-screenshot-compose'), async (original) => ({
  ...(await original()),
  composeMarkupDataUrl: fixture.compose
}))
vi.mock(import('@/i18n/i18n'), async (original) => ({
  ...(await original()),
  translate: (_key: string, fallback: string) => fallback
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: fixture.success } }))
const initial = useAppStore.getInitialState()
const api = Object.getOwnPropertyDescriptor(window, 'api')
const target = {
  worktreeId: 'folder:fixture',
  page: 'page',
  environmentId: 'paired',
  remotePageId: 'remote',
  browserHostClientId: 'desktop',
  browserHostGeneration: 3,
  pageHostGeneration: 4
}
const placement = {
  kind: 'client',
  browserHostClientId: target.browserHostClientId,
  browserHostGeneration: 3,
  pageHostGeneration: 4
} as const
beforeEach(() => {
  fixture.capture.mockReset().mockResolvedValue({ dataUrl: 'captured', width: 100, height: 80 })
  fixture.compose
    .mockReset()
    .mockResolvedValue({ dataUrl: 'data:image/png;base64,fixture', width: 100, height: 80 })
  fixture.write.mockReset().mockResolvedValue({ written: true })
  fixture.success.mockReset()
  installClientHostedPaneApi({ ui: { writeVerifiedClipboardImage: fixture.write } })
  useAppStore.setState({
    settings: getDefaultSettings('/fixture'),
    persistedUIReady: true,
    activeModal: 'none',
    activeWorktreeId: target.worktreeId
  })
  useAppStore
    .getState()
    .createBrowserTab(target.worktreeId, 'https://example.test', { browserPageId: target.page })
  useAppStore.setState((state) => ({
    settings: {
      ...getDefaultSettings('/fixture'),
      activeRuntimeEnvironmentId: target.environmentId
    },
    browserPagesByWorkspace: Object.fromEntries(
      Object.entries(state.browserPagesByWorkspace).map(([workspace, pages]) => [
        workspace,
        pages.map((page) => ({ ...page, browserRuntimeEnvironmentId: target.environmentId }))
      ])
    ),
    remoteBrowserPageHandlesByPageId: {
      [target.page]: {
        environmentId: target.environmentId,
        remotePageId: target.remotePageId,
        placement
      }
    }
  }))
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
function mount() {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: The fake guest supplies only geometry/style consumed by the existing capture owner; native Electron methods are not called.
  const guest = document.createElement('webview') as Electron.WebviewTag
  guest.getBoundingClientRect = () => new DOMRect(0, 0, 100, 80)
  function Owner() {
    const handle = useAppStore((state) => state.remoteBrowserPageHandlesByPageId[target.page])
    const markup = useClientHostedBrowserMarkup({
      webviewRef: { current: guest },
      browserPageId: target.page,
      runtimeEnvironmentId: target.environmentId,
      placement: handle?.placement?.kind === 'client' ? handle.placement : null,
      isActive: true,
      unavailable: false,
      showFailureOverlay: false
    })
    return markup.overlay
  }
  return { view: render(<Owner />), guest }
}
function request(action: 'start' | 'copy' | 'status') {
  return applyBrowserViewerRequest({
    id: 'fixture',
    expiresAt: Date.now() + 5000,
    command: { viewer: 'host', operation: 'client-markup', target, action }
  })
}
async function start(view: ReturnType<typeof render>) {
  let pending: Promise<BrowserViewerResult> | undefined
  await act(async () => {
    pending = request('start')
    void pending.catch(() => {})
  })
  await expect(pending).resolves.toMatchObject({ applied: true })
  const image = view.container.querySelector('img')
  if (!image) {
    throw new Error('missing capture image')
  }
  fireEvent.load(image)
}
it('uses the actual client overlay composition and strict clipboard ack before restoring the guest', async () => {
  const { view, guest } = mount()
  await start(view)
  const canvas = view.container.querySelector('canvas')
  if (!canvas) {
    throw new Error('missing drawing canvas')
  }
  canvas.setPointerCapture = vi.fn()
  fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, clientX: 0, clientY: 0 })
  fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 50, clientY: 0 })
  fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 50, clientY: 0 })
  let pending: Promise<BrowserViewerResult> | undefined
  await act(async () => {
    pending = request('copy')
    void pending.catch(() => {})
  })
  await expect(pending).resolves.toMatchObject({
    clientMarkup: {
      ...target,
      action: 'copy',
      copied: true,
      state: 'idle',
      hasImage: false,
      accepted: true
    }
  })
  expect(fixture.compose).toHaveBeenCalledWith(
    expect.objectContaining({
      displayCssWidth: 100,
      displayCssHeight: 80,
      shapes: [expect.objectContaining({ kind: 'pen' })]
    })
  )
  expect(fixture.write).toHaveBeenCalledWith('data:image/png;base64,fixture')
  expect(fixture.success).toHaveBeenCalledOnce()
  expect(view.container.querySelector('[data-orca-markup-overlay]')).toBeNull()
  expect(guest.style.display).toBe('flex')
})
it.each([undefined, { written: false }])(
  'refuses unverifiable clipboard acknowledgment %j and retains drawing',
  async (ack) => {
    const { view } = mount()
    await start(view)
    fixture.write.mockResolvedValueOnce(ack)
    let pending: Promise<BrowserViewerResult> | undefined
    await act(async () => {
      pending = request('copy')
      void pending.catch(() => {})
    })
    await expect(pending).rejects.toThrow('browser_markup_copy_effect_unknown')
    expect(view.container.querySelector('[data-orca-markup-overlay]')).not.toBeNull()
    expect(fixture.success).not.toHaveBeenCalled()
  }
)
it('rejects replaced placement while composition is pending before issuing a clipboard write', async () => {
  let resolveCompose: (value: { dataUrl: string; width: number; height: number }) => void = () => {
    throw new Error('composition not started')
  }
  fixture.compose.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveCompose = resolve
      })
  )
  const { view } = mount()
  await start(view)
  let pending: Promise<BrowserViewerResult> | undefined
  await act(async () => {
    pending = request('copy')
    void pending.catch(() => {})
  })
  await act(async () =>
    useAppStore.setState({
      remoteBrowserPageHandlesByPageId: {
        [target.page]: {
          environmentId: target.environmentId,
          remotePageId: target.remotePageId,
          placement: { ...placement, pageHostGeneration: 5 }
        }
      }
    })
  )
  await act(async () => resolveCompose({ dataUrl: 'stale', width: 100, height: 80 }))
  await expect(pending).rejects.toThrow('browser_markup_copy_effect_unknown')
  expect(fixture.write).not.toHaveBeenCalled()
  expect(fixture.success).not.toHaveBeenCalled()
})
it('does not acknowledge a clipboard write after its client placement is replaced', async () => {
  let acknowledge: (value: { written: true }) => void = () => {
    throw new Error('write not started')
  }
  fixture.write.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        acknowledge = resolve
      })
  )
  const { view } = mount()
  await start(view)
  let pending: Promise<BrowserViewerResult> | undefined
  await act(async () => {
    pending = request('copy')
    void pending.catch(() => {})
  })
  expect(fixture.write).toHaveBeenCalledOnce()
  await act(async () =>
    useAppStore.setState({
      remoteBrowserPageHandlesByPageId: {
        [target.page]: {
          environmentId: target.environmentId,
          remotePageId: target.remotePageId,
          placement: { ...placement, pageHostGeneration: 5 }
        }
      }
    })
  )
  await act(async () => acknowledge({ written: true }))
  await expect(pending).rejects.toThrow('browser_markup_copy_effect_unknown')
  expect(fixture.success).not.toHaveBeenCalled()
  expect(view.container.querySelector('[data-orca-markup-overlay]')).toBeNull()
})
