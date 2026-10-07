// @vitest-environment happy-dom
import { useRef, useState, type ReactNode } from 'react'
import { act, cleanup, render } from '@testing-library/react'
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
  return {
    ...settings,
    browserUrlHistory: history,
    workspaceDocHistory: documents
  }
})
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: typeof fixture) => unknown) => selector(fixture)
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
afterEach(cleanup)
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
