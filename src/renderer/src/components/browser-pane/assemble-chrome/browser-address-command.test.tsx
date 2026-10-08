import { BrowserPageToolbar } from './browser-page-toolbar'
// @vitest-environment happy-dom
import { useRef, useState, type ReactNode } from 'react'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { WorkspaceDocHistoryEntry } from '../../../../../shared/workspace-doc-history'
import type { BrowserHistoryEntry } from '../../../../../shared/browser-workspace-types'
import type {
  BrowserAddressCommand,
  BrowserAddressState
} from '../../../../../shared/rpc-contract/browser-address-params'
import { requestBrowserAddress } from '@/runtime/browser-address-request'
import BrowserAddressBar from './BrowserAddressBar'
const fixture = vi.hoisted(() => {
  const history: BrowserHistoryEntry[] = [
    {
      url: 'https://fixture.invalid/review',
      normalizedUrl: 'https://fixture.invalid/review',
      title: 'Review',
      lastVisitedAt: 1,
      visitCount: 2
    }
  ]
  const documents: WorkspaceDocHistoryEntry[] = []
  const settings: {
    browserDefaultSearchEngine: string | null
    browserKagiSessionLink: string | null
  } = { browserDefaultSearchEngine: null, browserKagiSessionLink: null }
  const unsubscribe = vi.fn()
  return {
    ...settings,
    browserUrlHistory: history,
    workspaceDocHistory: documents,
    subscribe: vi.fn(() => unsubscribe),
    unsubscribe
  }
})
vi.mock('@/hooks/useShortcutLabel', () => ({ useShortcutLabel: () => '' }))
vi.mock('./use-browser-toolbar-history-commands', () => ({
  useBrowserToolbarHistoryCommands: () => {}
}))
vi.mock('./browser-chrome-toolbar', () => ({
  BrowserChromeToolbar: ({ addressSlot }: { addressSlot: ReactNode }) => <>{addressSlot}</>
}))
vi.mock('@/store', () => ({
  useAppStore: Object.assign((selector: (state: typeof fixture) => unknown) => selector(fixture), {
    subscribe: fixture.subscribe
  })
}))
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))
vi.mock('@/components/ui/command', () => ({
  Command: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandItem: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))
beforeEach(() => {
  vi.clearAllMocks()
  fixture.workspaceDocHistory = []
  fixture.browserDefaultSearchEngine = null
  fixture.browserKagiSessionLink = null
})
afterEach(() => {
  cleanup()
  expect(fixture.unsubscribe).toHaveBeenCalledTimes(fixture.subscribe.mock.calls.length)
})
const submit = vi.fn()
const navigate = vi.fn()
const openDoc = vi.fn()
function Harness({ active = true }: { active?: boolean }) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [value, onChange] = useState('before')
  return (
    <BrowserAddressBar
      value={value}
      onChange={onChange}
      onSubmit={submit}
      onNavigate={navigate}
      onOpenWorkspaceDoc={openDoc}
      inputRef={inputRef}
      commandOwner={{ page: 'p1', active }}
    />
  )
}
async function command(command: BrowserAddressCommand) {
  let response: Promise<BrowserAddressState> | undefined
  await act(async () => {
    response = requestBrowserAddress('p1', command, Date.now() + 5000)
    void response.catch(() => {})
  })
  if (!response) {
    throw new Error('missing address request')
  }
  return response
}
it('opens and edits the real address owner, previews history and restores typed query on dismissal', async () => {
  const view = render(<Harness />)
  expect(await command({ action: 'open' })).toMatchObject({ open: true, focused: true })
  const draft = await command({ action: 'draft', text: 'review' })
  expect(draft.value).toBe('review')
  const history = draft.suggestions.find((row) => row.kind === 'history')
  if (!history) {
    throw new Error('missing history suggestion')
  }
  expect(await command({ action: 'highlight', index: history.index })).toMatchObject({
    value: 'review',
    selectedIndex: history.index
  })
  await command({ action: 'highlight', index: 0 })
  expect(await command({ action: 'next' })).toMatchObject({
    value: history.url,
    selectedIndex: history.index
  })
  expect(await command({ action: 'previous' })).toMatchObject({ value: 'review' })
  expect(await command({ action: 'preview', index: history.index })).toMatchObject({
    value: history.url,
    selectedIndex: history.index
  })
  const input = view.getByRole('combobox')
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('missing address input')
  }
  expect(input.value).toBe(history.url)
  expect(await command({ action: 'dismiss' })).toMatchObject({ open: false, value: 'review' })
})
it('routes selection and submission through original callbacks and marks navigation only requested', async () => {
  vi.clearAllMocks()
  render(<Harness />)
  const draft = await command({ action: 'draft', text: 'review' })
  const history = draft.suggestions.find((row) => row.kind === 'history')
  if (!history) {
    throw new Error('missing history suggestion')
  }
  expect(await command({ action: 'select', index: history.index })).toMatchObject({
    open: false,
    navigationRequested: true
  })
  expect(navigate).toHaveBeenCalledWith(history.url)
  expect(await command({ action: 'submit' })).toMatchObject({
    open: false,
    navigationRequested: true
  })
  expect(submit).toHaveBeenCalledOnce()
})

it('keeps workspace-document selection on its existing owner callback', async () => {
  const location = {
    kind: 'workspace-doc' as const,
    worktreeId: 'folder-1',
    filePath: join(tmpdir(), 'address-report.html')
  }
  fixture.workspaceDocHistory = [
    { docLocation: location, title: 'Report', lastVisitedAt: 3, visitCount: 1 }
  ]
  render(<Harness />)
  const draft = await command({ action: 'draft', text: '' })
  const doc = draft.suggestions.find((row) => row.kind === 'workspace-doc')
  if (!doc) {
    throw new Error('missing document suggestion')
  }
  expect(await command({ action: 'select', index: doc.index })).toMatchObject({
    navigationRequested: true
  })
  expect(openDoc).toHaveBeenCalledExactlyOnceWith(location)
  expect(navigate).not.toHaveBeenCalled()
})
it('rejects inactive, foreign, expired, oversized and invalid suggestion requests before effects', async () => {
  const owner = render(<Harness />)
  await expect(
    requestBrowserAddress('other', { action: 'open' }, Date.now() + 5000)
  ).rejects.toThrow('browser_address_ui_unavailable')
  await expect(
    requestBrowserAddress('p1', { action: 'draft', text: 'changed' }, 0)
  ).rejects.toThrow('request_expired')
  await expect(command({ action: 'draft', text: '한'.repeat(700) })).rejects.toThrow(
    'browser_address_query_too_large'
  )
  await expect(command({ action: 'select', index: 999 })).rejects.toThrow(
    'browser_address_suggestion_unavailable'
  )
  expect(await command({ action: 'status' })).toMatchObject({ value: 'before', open: false })
  expect(navigate).not.toHaveBeenCalled()
  owner.unmount()
  render(<Harness active={false} />)
  await expect(command({ action: 'draft', text: 'changed' })).rejects.toThrow(
    'browser_address_viewer_inactive'
  )
})
it('redacts the private Kagi session token from address and suggestion output', async () => {
  fixture.browserDefaultSearchEngine = 'kagi'
  fixture.browserKagiSessionLink = 'https://kagi.com/search?token=fixture-secret'
  render(<Harness />)
  const state = await command({ action: 'draft', text: 'private search' })
  expect(state.suggestions.some((row) => row.kind === 'search')).toBe(true)
  expect(JSON.stringify(state)).not.toContain('fixture-secret')
})
it('uses original blur delay to close suggestions and restore the typed query before acknowledgement', async () => {
  vi.useFakeTimers()
  try {
    render(<Harness />)
    const draft = await command({ action: 'draft', text: 'review' })
    const history = draft.suggestions.find((row) => row.kind === 'history')
    if (!history) {
      throw new Error('missing history')
    }
    await command({ action: 'preview', index: history.index })
    let response: Promise<BrowserAddressState> | undefined
    let settled = false
    await act(async () => {
      response = requestBrowserAddress('p1', { action: 'blur' }, Date.now() + 5000)
      void response.then(
        () => {
          settled = true
        },
        () => {
          settled = true
        }
      )
    })
    expect(settled).toBe(false)
    await act(async () => {
      vi.advanceTimersByTime(199)
    })
    expect(settled).toBe(false)
    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    await expect(response).resolves.toMatchObject({ open: false, focused: false, value: 'review' })
  } finally {
    vi.useRealTimers()
  }
})
it('keeps a genuine refocus during the blur grace window open instead of reporting a false close', async () => {
  vi.useFakeTimers()
  try {
    const view = render(<Harness />)
    await command({ action: 'draft', text: 'review' })
    let response: Promise<BrowserAddressState> | undefined
    await act(async () => {
      response = requestBrowserAddress('p1', { action: 'blur' }, Date.now() + 5000)
      void response.catch(() => {})
    })
    const input = view.getByRole('combobox')
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('missing input')
    }
    await act(async () => {
      input.focus()
      vi.advanceTimersByTime(5000)
    })
    await expect(response).rejects.toThrow('timeout')
    expect(await command({ action: 'status' })).toMatchObject({
      open: true,
      focused: true,
      value: 'review'
    })
  } finally {
    vi.useRealTimers()
  }
})
it('preserves initial collapsed click selection and native drag selection guards', async () => {
  const view = render(<Harness />)
  const input = view.getByRole('combobox')
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('missing input')
  }
  fireEvent.mouseDown(input, { button: 0 })
  await act(async () => {
    input.focus()
    input.setSelectionRange(2, 2)
  })
  fireEvent.click(input)
  expect([input.selectionStart, input.selectionEnd]).toEqual([0, input.value.length])
  await act(async () => {
    input.blur()
  })
  fireEvent.mouseDown(input, { button: 0 })
  await act(async () => {
    input.focus()
    input.setSelectionRange(1, 3)
  })
  fireEvent.click(input)
  expect([input.selectionStart, input.selectionEnd]).toEqual([1, 3])
  expect(await command({ action: 'open' })).toMatchObject({ open: true, focused: true })
  expect([input.selectionStart, input.selectionEnd]).toEqual([0, input.value.length])
})

it('binds the actual BrowserPageToolbar page and active owner to its address receiver', async () => {
  const view = render(<ToolbarOwner />)
  let response: Promise<BrowserAddressState> | undefined
  await act(async () => {
    response = requestBrowserAddress(
      'toolbar-page',
      { action: 'draft', text: 'https://owner.invalid' },
      Date.now() + 5000
    )
    void response.catch(() => {})
  })
  await expect(response).resolves.toMatchObject({ value: 'https://owner.invalid' })
  const input = view.container.querySelector('input')
  expect(input?.value).toBe('https://owner.invalid')
  view.rerender(<ToolbarOwner active={false} />)
  await expect(
    requestBrowserAddress('toolbar-page', { action: 'draft', text: 'blocked' }, Date.now() + 5000)
  ).rejects.toThrow('browser_address_viewer_inactive')
  expect(input?.value).toBe('https://owner.invalid')
  await expect(
    requestBrowserAddress('wrong-page', { action: 'status' }, Date.now() + 5000)
  ).rejects.toThrow('browser_address_ui_unavailable')
})

it('applies blur through the actual BrowserPageToolbar address owner', async () => {
  vi.useFakeTimers()
  try {
    render(<ToolbarOwner />)
    let response: Promise<BrowserAddressState> | undefined
    await act(async () => {
      response = requestBrowserAddress(
        'toolbar-page',
        { action: 'draft', text: 'owner blur' },
        Date.now() + 5000
      )
      void response.catch(() => {})
    })
    await expect(response).resolves.toMatchObject({ focused: true, value: 'owner blur' })
    await act(async () => {
      response = requestBrowserAddress('toolbar-page', { action: 'blur' }, Date.now() + 5000)
      void response.catch(() => {})
    })
    await act(async () => {
      vi.advanceTimersByTime(200)
    })
    await expect(response).resolves.toMatchObject({
      focused: false,
      open: false,
      value: 'owner blur'
    })
  } finally {
    vi.useRealTimers()
  }
})
function ToolbarOwner({ active = true }: { active?: boolean }) {
  const [value, setValue] = useState('about:blank')
  const ref = useRef<HTMLInputElement | null>(null)
  return (
    <BrowserPageToolbar
      browserPageId="toolbar-page"
      workspaceId="workspace-fixture"
      worktreeId="folder-fixture"
      sessionProfileId={null}
      viewportPresetId={null}
      isActive={active}
      canGoBack={false}
      canGoForward={false}
      loading={false}
      webviewRef={{ current: null }}
      reloadMenuOpen={false}
      setReloadMenuOpen={vi.fn()}
      reloadButtonLabel="Reload"
      reloadButtonLabelKind="reload"
      reloadShortcut=""
      hardReloadShortcut=""
      runReloadTrigger={vi.fn()}
      addressBarValue={value}
      setAddressBarValue={setValue}
      submitAddressBar={vi.fn()}
      navigateToUrl={vi.fn()}
      addressBarInputRef={ref}
      dismissAddressBarSuggestionsRef={{ current: null }}
      grab={{
        state: 'idle',
        payload: null,
        error: null,
        contextMenu: false,
        toggle: vi.fn(),
        cancel: vi.fn(),
        rearm: vi.fn(),
        exit: vi.fn()
      }}
      grabIntent="copy"
      startGrabIntent={vi.fn()}
      isBlankTab={false}
      markupIsActive={false}
      markupStart={async () => {}}
      markupCancel={vi.fn()}
      grabElementShortcut=""
      browserAnnotationsLength={0}
      shareableArtifactFile={null}
      currentBrowserUrl="about:blank"
      externalUrl={null}
    />
  )
}
