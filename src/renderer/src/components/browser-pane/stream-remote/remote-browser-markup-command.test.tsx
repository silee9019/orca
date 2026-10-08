// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { requestRemoteBrowserPane } from '@/runtime/browser-remote-pane-request'
import type { BrowserRemotePaneCommand } from '../../../../../shared/rpc-contract/browser-remote-pane-params'
import { MarkupOverlay } from '../annotate/MarkupOverlay'
import { useRemoteBrowserMarkupCapture } from './use-remote-browser-markup-capture'
import { useRemoteBrowserPaneCommands } from './use-remote-browser-pane-commands'
const fixture = vi.hoisted(() => ({ capture: vi.fn(), compose: vi.fn(), write: vi.fn() }))
vi.mock('../annotate/markup-base-image', () => ({ captureMarkupBaseImage: fixture.capture }))
vi.mock(import('../annotate/markup-screenshot-compose'), async (original) => ({
  ...(await original()),
  composeMarkupDataUrl: fixture.compose
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const originalApi = Object.getOwnPropertyDescriptor(window, 'api')
beforeEach(() => {
  vi.clearAllMocks()
  fixture.capture.mockResolvedValue({ dataUrl: 'captured', width: 100, height: 80 })
  fixture.compose.mockResolvedValue({
    dataUrl: 'data:image/png;base64,fixture',
    width: 100,
    height: 80
  })
  fixture.write.mockResolvedValue({ written: true })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { ui: { writeVerifiedClipboardImage: fixture.write } }
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  if (originalApi) {
    Object.defineProperty(window, 'api', originalApi)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})
function Owner({
  environmentId = 'env-1',
  remotePageId = 'page-1'
}: {
  environmentId?: string
  remotePageId?: string
}) {
  const imageRef = useRef<HTMLImageElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const mode = useRemoteBrowserMarkupCapture(imageRef, viewportRef, {
    page: 'local-page',
    active: true,
    environmentId,
    remotePageId
  })
  useRemoteBrowserPaneCommands({
    page: 'local-page',
    active: true,
    staged: false,
    environmentId,
    remotePageId,
    streamStatus: { kind: 'live' },
    reconnectGeneration: 0,
    reconnect: () => {},
    performMarkup: mode.performCommand
  })
  return (
    <div ref={viewportRef}>
      <img ref={imageRef} src="frame" />
      {mode.baseImage && (
        <MarkupOverlay
          baseImage={mode.baseImage}
          busy={mode.state === 'composing'}
          commandOwner={mode.commandOwner}
          onCompleteVerified={mode.completeVerified}
          onComplete={(input) => void mode.complete(input)}
          onCancel={mode.cancel}
        />
      )}
    </div>
  )
}
async function command(command: BrowserRemotePaneCommand) {
  let response: Promise<unknown> | undefined
  await act(async () => {
    response = requestRemoteBrowserPane('local-page', command, Date.now() + 3000)
    void response.catch(() => {})
  })
  return response
}
it('uses remote capture/controller/editor and resets only after clipboard acknowledgment', async () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 100, 80)
  )
  const view = render(<Owner />)
  const target = { environmentId: 'env-1', expectedRemotePageId: 'page-1' }
  await expect(
    command({ ...target, action: 'markup', markupAction: 'start' })
  ).resolves.toMatchObject({ markup: { state: 'drawing', hasImage: true } })
  expect(fixture.capture).toHaveBeenCalledOnce()
  const image = view.container.querySelector('[data-orca-markup-overlay] img')
  if (!image) {
    throw new Error('missing captured image')
  }
  fireEvent.load(image)
  await expect(
    command({ ...target, action: 'markup-editor', editor: { action: 'tool', value: 'rect' } })
  ).resolves.toMatchObject({ markupEditor: { tool: 'rect' } })
  fixture.write.mockResolvedValueOnce(undefined)
  await expect(
    command({ ...target, action: 'markup-editor', editor: { action: 'copy' } })
  ).rejects.toThrow('browser_markup_copy_effect_unknown')
  expect(view.container.querySelector('[data-orca-markup-overlay]')).not.toBeNull()
  await expect(
    command({ ...target, action: 'markup-editor', editor: { action: 'copy' } })
  ).resolves.toMatchObject({ markupEditor: { copied: true } })
  expect(fixture.write).toHaveBeenLastCalledWith('data:image/png;base64,fixture')
  expect(view.container.querySelector('[data-orca-markup-overlay]')).toBeNull()
  await expect(
    command({ ...target, action: 'markup', markupAction: 'start' })
  ).resolves.toMatchObject({ markup: { state: 'drawing' } })
  await expect(
    command({ ...target, action: 'markup', markupAction: 'cancel' })
  ).resolves.toMatchObject({ markup: { state: 'idle', hasImage: false } })
})

it('cancels pending capture through the existing controller without restoring late images', async () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 100, 80)
  )
  let finishCapture: (value: { dataUrl: string; width: number; height: number }) => void = () => {
    throw new Error('capture not started')
  }
  fixture.capture.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishCapture = resolve
      })
  )
  const view = render(<Owner />)
  const target = { environmentId: 'env-1', expectedRemotePageId: 'page-1' }
  let starting: Promise<unknown> | undefined
  await act(async () => {
    starting = requestRemoteBrowserPane(
      'local-page',
      { ...target, action: 'markup', markupAction: 'start' },
      Date.now() + 3000
    )
    void starting.catch(() => {})
  })
  await expect(
    command({ ...target, action: 'markup', markupAction: 'cancel' })
  ).resolves.toMatchObject({ markup: { state: 'idle' } })
  await expect(starting).rejects.toThrow('browser_markup_cancelled')
  await act(async () => finishCapture({ dataUrl: 'late', width: 100, height: 80 }))
  expect(view.container.querySelector('[data-orca-markup-overlay]')).toBeNull()
  expect(fixture.write).not.toHaveBeenCalled()
})
it('fences the captured owner before clipboard delivery when identity changes during composition', async () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 100, 80)
  )
  const view = render(<Owner />)
  const target = { environmentId: 'env-1', expectedRemotePageId: 'page-1' }
  await command({ ...target, action: 'markup', markupAction: 'start' })
  const image = view.container.querySelector('[data-orca-markup-overlay] img')
  if (!image) {
    throw new Error('missing captured image')
  }
  fireEvent.load(image)
  let finishComposition: (value: {
    dataUrl: string
    width: number
    height: number
  }) => void = () => {
    throw new Error('composition not started')
  }
  fixture.compose.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishComposition = resolve
      })
  )
  let copying: Promise<unknown> | undefined
  await act(async () => {
    copying = requestRemoteBrowserPane(
      'local-page',
      { ...target, action: 'markup-editor', editor: { action: 'copy' } },
      Date.now() + 3000
    )
    void copying.catch(() => {})
  })
  await vi.waitFor(() => expect(fixture.compose).toHaveBeenCalledOnce())
  view.rerender(<Owner environmentId="env-2" remotePageId="page-2" />)
  await act(async () => finishComposition({ dataUrl: 'stale', width: 100, height: 80 }))
  await expect(copying).rejects.toThrow()
  expect(fixture.write).not.toHaveBeenCalled()
  expect(view.container.querySelector('[data-orca-markup-overlay]')).toBeNull()
})
