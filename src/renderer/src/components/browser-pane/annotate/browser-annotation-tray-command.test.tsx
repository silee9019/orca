// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createUiAgentActions } from '@/store/slices/ui/ui-slice-agent-actions'
import { createTestStore } from '@/store/slices/browser-slice-test-harness'
import { requestBrowserAnnotationTray } from '@/runtime/browser-annotation-tray-request'
import type {
  BrowserAnnotationTrayAction,
  BrowserAnnotationTrayState
} from '../../../../../shared/rpc-contract/browser-annotation-tray-params'
import { useBrowserPageAnnotationSend } from './use-browser-page-annotation-send'
import { useBrowserAnnotationTrayCommands } from './use-browser-annotation-tray-commands'
import { makeAnnotation } from './browser-annotation-command-test-fixture'
const fixture = vi.hoisted((): { store?: ReturnType<typeof createTestStore> } => ({}))
vi.mock('@/store', () => ({
  useAppStore: (
    selector: (state: ReturnType<ReturnType<typeof createTestStore>['getState']>) => unknown
  ) => {
    if (!fixture.store) {
      throw new Error('missing browser store')
    }
    return fixture.store(selector)
  }
}))
vi.mock('@/lib/running-agent-targets', () => ({
  deriveRunningAgentSendTargets: () => [],
  resolveRunningAgentSendTarget: vi.fn(),
  runningAgentMessageTarget: vi.fn(),
  runningAgentSendTargetAgentType: vi.fn()
}))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
let clipboard = ''
const write = vi.fn(async (text: string) => {
  clipboard = text
})
const read = vi.fn(async () => clipboard)
beforeEach(() => {
  vi.clearAllMocks()
  clipboard = ''
  fixture.store = createTestStore()
  fixture.store.setState({
    activeGroupIdByWorktree: {},
    ...createUiAgentActions(fixture.store.setState, fixture.store.getState)
  })
  fixture.store.getState().addBrowserPageAnnotation(makeAnnotation('p1'))
  Object.defineProperty(window, 'api', {
    value: { ui: { writeClipboardText: write, readClipboardText: read } },
    configurable: true
  })
})
afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'api')
})
function mount(active = true) {
  return renderHook(() => {
    const controller = useBrowserPageAnnotationSend({ browserTabId: 'p1', worktreeId: 'folder-1' })
    useBrowserAnnotationTrayCommands({ page: 'p1', active }, controller)
    return controller
  })
}
async function command(action: BrowserAnnotationTrayAction) {
  let response: Promise<BrowserAnnotationTrayState> | undefined
  await act(async () => {
    response = requestBrowserAnnotationTray('p1', action, Date.now() + 5000)
    void response.catch(() => {})
  })
  if (!response) {
    throw new Error('missing annotation tray response')
  }
  return response
}
it('copies the original annotation formatter only after exact clipboard readback and commits copied state', async () => {
  const owner = mount()
  expect(await command('close')).toMatchObject({ open: false, noteCount: 1 })
  expect(await command('open')).toMatchObject({ open: true })
  expect(await command('copy')).toMatchObject({ copied: true, noteCount: 1 })
  expect(clipboard).toContain('Fix this button')
  expect(write).toHaveBeenCalledWith(clipboard)
  expect(read).toHaveBeenCalledOnce()
  expect(owner.result.current.browserAnnotationsCopied).toBe(true)
  expect(await command('clear')).toMatchObject({ noteCount: 0, copied: false })
})
it('does not commit copied feedback when clipboard readback mismatches', async () => {
  const owner = mount()
  read.mockResolvedValueOnce('foreign clipboard contents')
  await expect(command('copy')).rejects.toThrow('browser_annotation_copy_failed_effect_unknown')
  expect(owner.result.current.browserAnnotationsCopied).toBe(false)
})

it('opens the original send target mode without delivering or clearing any note', async () => {
  mount()
  expect(await command('send-menu-open')).toMatchObject({ sendMenuOpen: true, noteCount: 1 })
  const target = fixture.store?.getState().agentSendPopoverTargetMode
  expect(target).toMatchObject({
    id: 'browser-annotations:p1:tray',
    worktreeId: 'folder-1',
    source: 'browser-annotations',
    status: 'open'
  })
  expect(target?.prompt).toContain('Fix this button')
  expect(await command('send-menu-close')).toMatchObject({ sendMenuOpen: false, noteCount: 1 })
})
it('blocks stale copied feedback if annotations change while native clipboard write is pending', async () => {
  let finishWrite: () => void = () => {
    throw new Error('clipboard write not started')
  }
  write.mockImplementationOnce(
    (text) =>
      new Promise<void>((resolve) => {
        clipboard = text
        finishWrite = resolve
      })
  )
  const owner = mount()
  let pending: Promise<BrowserAnnotationTrayState> | undefined
  await act(async () => {
    pending = requestBrowserAnnotationTray('p1', 'copy', Date.now() + 5000)
    void pending.catch(() => {})
  })
  await act(async () => {
    fixture.store
      ?.getState()
      .updateBrowserPageAnnotation('p1', 'annotation-1', { comment: 'changed', intent: 'fix' })
    finishWrite()
  })
  if (!pending) {
    throw new Error('missing pending copy')
  }
  await expect(pending).rejects.toThrow('browser_annotation_copy_failed_effect_unknown')
  expect(owner.result.current.browserAnnotationsCopied).toBe(false)
})
it('rejects inactive, expired, foreign and empty-copy requests without invoking clipboard', async () => {
  const owner = mount(false)
  await expect(command('copy')).rejects.toThrow('browser_annotation_viewer_inactive')
  owner.unmount()
  mount()
  await expect(requestBrowserAnnotationTray('other', 'copy', Date.now() + 5000)).rejects.toThrow(
    'browser_annotation_tray_ui_unavailable'
  )
  await expect(requestBrowserAnnotationTray('p1', 'copy', 0)).rejects.toThrow('request_expired')
  await command('clear')
  await expect(command('copy')).rejects.toThrow('browser_annotations_empty')
  expect(write).not.toHaveBeenCalled()
})
