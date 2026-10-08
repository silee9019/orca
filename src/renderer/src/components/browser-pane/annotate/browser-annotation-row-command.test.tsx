// @vitest-environment happy-dom
import { useSyncExternalStore } from 'react'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { AppState } from '@/store/types'
import { createTestStore } from '@/store/slices/store-test-helpers'
import { TooltipProvider } from '@/components/ui/tooltip'
import { requestBrowserAnnotationRow } from '@/runtime/browser-annotation-row-request'
import type { BrowserAnnotationRowCommand } from '../../../../../shared/rpc-contract/browser-annotation-row-params'
import { BrowserGuestAnnotateOverlays } from './browser-guest-annotate-overlays'
import { makeBrowserGuestOverlayFixture } from './browser-guest-overlay-test-fixture'
import { useBrowserPageAnnotationSend } from './use-browser-page-annotation-send'
import { makeAnnotation } from './browser-annotation-command-test-fixture'
const fixture = vi.hoisted(() => {
  let store: ReturnType<typeof createTestStore> | undefined
  return {
    getStore: () => {
      if (!store) {
        throw new Error('missing store')
      }
      return store
    },
    setStore: (value: ReturnType<typeof createTestStore>) => {
      store = value
    }
  }
})
vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: AppState) => unknown) =>
      selector(useSyncExternalStore(fixture.getStore().subscribe, fixture.getStore().getState)),
    { getState: () => fixture.getStore().getState() }
  )
}))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('./BrowserAnnotationSendMenuContent', () => ({
  BrowserAnnotationSendMenuContent: () => null
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('@/components/terminal-pane/pty-dispatcher', () => ({
  restorePtyDataHandlersAfterFailedShutdown: vi.fn(),
  unregisterPtyDataHandlers: () => []
}))
const container = document.createElement('div')
const props = makeBrowserGuestOverlayFixture(container)
beforeEach(() => {
  fixture.setStore(createTestStore())
  fixture.getStore().getState().addBrowserPageAnnotation(makeAnnotation('p1'))
  fixture.getStore().getState().addBrowserPageAnnotation(makeAnnotation('p1', 'annotation-2'))
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      ui: { set: vi.fn().mockResolvedValue(undefined) },
      settings: { set: vi.fn().mockResolvedValue(undefined) }
    }
  })
})
afterEach(cleanup)
function Owner({ active = true }: { active?: boolean }) {
  const annotationSend = useBrowserPageAnnotationSend({ browserTabId: 'p1', worktreeId: 'folder' })
  return (
    <TooltipProvider>
      <BrowserGuestAnnotateOverlays
        {...props}
        annotationSend={annotationSend}
        markup={{
          state: 'idle',
          isActive: false,
          baseImage: null,
          start: vi.fn(async () => {}),
          cancel: vi.fn(),
          complete: vi.fn(async () => {}),
          commandOwner: { page: 'p1', active }
        }}
      />
    </TooltipProvider>
  )
}
async function command(command: BrowserAnnotationRowCommand, page = 'p1') {
  let response: ReturnType<typeof requestBrowserAnnotationRow> | undefined
  await act(async () => {
    response = requestBrowserAnnotationRow(page, command, Date.now() + 5000)
    void response.catch(() => {})
  })
  if (!response) {
    throw new Error('missing response')
  }
  return response
}
it('uses actual overlay/tray local edit owner and original store update with trimmed save readback', async () => {
  const view = render(<Owner />)
  expect(await command({ action: 'status' })).toMatchObject({ editingAnnotationId: null })
  expect(await command({ action: 'start', annotationId: 'annotation-1' })).toMatchObject({
    editingAnnotationId: 'annotation-1',
    comment: 'Fix this button',
    intent: 'fix'
  })
  expect(view.getByLabelText('Annotation comment')).toHaveProperty('value', 'Fix this button')
  await command({ action: 'comment', value: '  edited note  ' })
  await command({ action: 'intent', value: 'question' })
  expect(view.getByLabelText('Annotation comment')).toHaveProperty('value', '  edited note  ')
  expect(fixture.getStore().getState().browserAnnotationsByPageId.p1?.[0]?.comment).toBe(
    'Fix this button'
  )
  expect(await command({ action: 'save' })).toMatchObject({
    editingAnnotationId: null,
    savedAnnotationId: 'annotation-1'
  })
  expect(fixture.getStore().getState().browserAnnotationsByPageId.p1?.[0]).toMatchObject({
    comment: 'edited note',
    intent: 'question'
  })
  expect(view.queryByLabelText('Annotation comment')).toBeNull()
})
it('shares UI textarea change and Escape cancel with typed editor state without persisting drafts', async () => {
  const view = render(<Owner />)
  await command({ action: 'start', annotationId: 'annotation-1' })
  fireEvent.change(view.getByLabelText('Annotation comment'), { target: { value: 'UI draft' } })
  expect(await command({ action: 'status' })).toMatchObject({ comment: 'UI draft' })
  fireEvent.click(view.getByLabelText('Question'))
  expect(await command({ action: 'status' })).toMatchObject({ intent: 'question' })
  fireEvent.keyDown(view.getByLabelText('Annotation comment'), { key: 'Escape' })
  expect(await command({ action: 'status' })).toMatchObject({
    editingAnnotationId: null,
    comment: 'UI draft'
  })
  expect(fixture.getStore().getState().browserAnnotationsByPageId.p1?.[0]?.comment).toBe(
    'Fix this button'
  )
  await command({ action: 'start', annotationId: 'annotation-1' })
  await command({ action: 'comment', value: 'cancelled' })
  expect(await command({ action: 'cancel' })).toMatchObject({ editingAnnotationId: null })
})
it('clears original edit state when the selected annotation is removed by another owner', async () => {
  render(<Owner />)
  await command({ action: 'start', annotationId: 'annotation-1' })
  act(() => fixture.getStore().getState().deleteBrowserPageAnnotation('p1', 'annotation-1'))
  expect(await command({ action: 'status' })).toMatchObject({ editingAnnotationId: null })
})
it('refuses missing annotation, unopened editor, blank save, inactive and foreign owner before editing effects', async () => {
  const view = render(<Owner />)
  await expect(command({ action: 'start', annotationId: 'missing' })).rejects.toThrow('row_missing')
  await expect(command({ action: 'comment', value: 'draft' })).rejects.toThrow('not_editing')
  await command({ action: 'start', annotationId: 'annotation-1' })
  await command({ action: 'comment', value: '   ' })
  await expect(command({ action: 'save' })).rejects.toThrow('empty_comment')
  expect(view.getByLabelText('Annotation comment')).toHaveProperty('value', '   ')
  await expect(command({ action: 'cancel' }, 'foreign')).rejects.toThrow('unavailable')
  view.rerender(<Owner active={false} />)
  await expect(command({ action: 'cancel' })).rejects.toThrow('inactive')
  expect(view.getByLabelText('Annotation comment')).toBeTruthy()
})
it('does not acknowledge save when the original update callback leaves the annotation unchanged', async () => {
  vi.spyOn(fixture.getStore().getState(), 'updateBrowserPageAnnotation').mockImplementation(
    () => {}
  )
  render(<Owner />)
  await command({ action: 'start', annotationId: 'annotation-1' })
  await command({ action: 'comment', value: 'changed' })
  await expect(command({ action: 'save' })).rejects.toThrow('not_applied')
  expect(fixture.getStore().getState().browserAnnotationsByPageId.p1?.[0]?.comment).toBe(
    'Fix this button'
  )
})
it('unregisters the actual row owner when its parent tray is closed', async () => {
  render(<Owner />)
  await command({ action: 'start', annotationId: 'annotation-1' })
  const { requestBrowserAnnotationTray } = await import('@/runtime/browser-annotation-tray-request')
  let response: ReturnType<typeof requestBrowserAnnotationTray> | undefined
  await act(async () => {
    response = requestBrowserAnnotationTray('p1', 'close', Date.now() + 5000)
    void response.catch(() => {})
  })
  expect(await response).toMatchObject({ open: false })
  await expect(command({ action: 'status' })).rejects.toThrow('unavailable')
})

it('does not acknowledge a save after its exact parent owner becomes inactive during the original callback', async () => {
  const store = fixture.getStore()
  const original = store.getState().updateBrowserPageAnnotation
  let changeOwner: (() => void) | undefined
  vi.spyOn(store.getState(), 'updateBrowserPageAnnotation').mockImplementation((...args) => {
    original(...args)
    changeOwner?.()
  })
  const view = render(<Owner />)
  changeOwner = () => view.rerender(<Owner active={false} />)
  await command({ action: 'start', annotationId: 'annotation-1' })
  await command({ action: 'comment', value: 'written before owner loss' })
  await expect(command({ action: 'save' })).rejects.toThrow('owner_changed_effect_unknown')
  expect(store.getState().browserAnnotationsByPageId.p1?.[0]?.comment).toBe(
    'written before owner loss'
  )
})

it('selects the only active actual row owner after collecting an inactive owner first', async () => {
  const view = render(
    <>
      <Owner active={false} />
      <Owner />
    </>
  )
  await command({ action: 'start', annotationId: 'annotation-1' })
  expect(view.getAllByLabelText('Annotation comment')).toHaveLength(1)
  expect(await command({ action: 'status' })).toMatchObject({ editingAnnotationId: 'annotation-1' })
})
it('refuses duplicate active row owners before either original editor callback runs', async () => {
  const view = render(
    <>
      <Owner />
      <Owner />
    </>
  )
  await expect(command({ action: 'start', annotationId: 'annotation-1' })).rejects.toThrow(
    'ambiguous'
  )
  expect(view.queryAllByLabelText('Annotation comment')).toHaveLength(0)
  expect(fixture.getStore().getState().browserAnnotationsByPageId.p1?.[0]?.comment).toBe(
    'Fix this button'
  )
})
