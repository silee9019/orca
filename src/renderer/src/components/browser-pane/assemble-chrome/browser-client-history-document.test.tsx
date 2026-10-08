// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useRef, useState } from 'react'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import BrowserAddressBar from './BrowserAddressBar'
import { useAppStore } from '@/store'
import { getDefaultSettings } from '../../../../../shared/constants'
import { convertBrowserPageToWorkspaceDoc } from '@/lib/file-preview'
import { requestBrowserClientHistoryDocument } from '@/runtime/browser-client-history-document-request'
import { TooltipProvider } from '@/components/ui/tooltip'

vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
const initial = useAppStore.getState()
const api = Object.getOwnPropertyDescriptor(window, 'api')
const root = join(tmpdir(), 'history-document')
const filePath = join(root, 'nested', 'fixture.html')
const target = {
  page: 'source-page',
  worktreeId: 'folder:outer',
  environmentId: 'paired',
  remotePageId: 'remote',
  browserHostClientId: 'desktop',
  browserHostGeneration: 3,
  pageHostGeneration: 4
}
const source = { kind: 'materialized' as const, target }
const item = { index: 0, worktreeId: 'folder:inner', filePath }
beforeEach(() => {
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      ui: { set: vi.fn().mockResolvedValue(undefined) },
      browser: {
        notifyActiveTabChanged: vi.fn().mockResolvedValue(undefined)
      }
    }
  })
  useAppStore.setState({
    settings: { ...getDefaultSettings(tmpdir()), activeRuntimeEnvironmentId: target.environmentId },
    persistedUIReady: true,
    activeModal: 'none',
    activeWorktreeId: target.worktreeId,
    folderWorkspaces: ['outer', 'inner'].map((id) => ({
      id,
      name: id,
      folderPath: id === 'outer' ? root : join(root, 'nested'),
      projectGroupId: 'fixture',
      connectionId: 'ssh-fixture',
      linkedTask: null,
      comment: '',
      isArchived: false,
      isUnread: false,
      isPinned: false,
      sortOrder: 0,
      lastActivityAt: 0,
      createdAt: 0,
      updatedAt: 0
    }))
  })
  useAppStore.getState().createBrowserTab(target.worktreeId, 'https://before.test/', {
    browserPageId: target.page,
    browserRuntimeEnvironmentId: target.environmentId
  })
  useAppStore.setState({
    remoteBrowserPageHandlesByPageId: {
      [target.page]: {
        environmentId: target.environmentId,
        remotePageId: target.remotePageId,
        placement: {
          kind: 'client',
          browserHostClientId: 'desktop',
          browserHostGeneration: 3,
          pageHostGeneration: 4
        }
      }
    },
    workspaceDocHistory: [
      {
        docLocation: { kind: 'workspace-doc', worktreeId: item.worktreeId, filePath },
        title: 'Fixture document',
        lastVisitedAt: 1,
        visitCount: 1
      }
    ]
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useAppStore.setState(initial, true)
  if (api) {
    Object.defineProperty(window, 'api', api)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})
function Owner() {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <TooltipProvider>
      <BrowserAddressBar
        commandOwner={{ page: target.page, historyDocumentSource: source, active: true }}
        value={value}
        onChange={setValue}
        inputRef={inputRef}
        onSubmit={vi.fn()}
        onNavigate={vi.fn()}
        onOpenWorkspaceDoc={(doc) => convertBrowserPageToWorkspaceDoc(target.page, doc)}
      />
    </TooltipProvider>
  )
}
it('selects the actual history suggestion identity instead of re-resolving its nested path', async () => {
  render(<Owner />)
  fireEvent.focus(screen.getByRole('combobox'))
  let receipt: unknown
  await act(async () => {
    receipt = await requestBrowserClientHistoryDocument(
      {
        viewer: 'host',
        operation: 'client-history-document',
        source,
        item
      },
      Date.now() + 5000
    )
  })
  expect(receipt).toMatchObject({ selected: true, item })
  const state = useAppStore.getState()
  expect(state.activeWorktreeId).toBe(item.worktreeId)
  const workspaceId = state.activeBrowserTabIdByWorktree[item.worktreeId]
  expect(state.browserPagesByWorkspace[workspaceId ?? '']).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        docLocation: { kind: 'workspace-doc', worktreeId: item.worktreeId, filePath }
      })
    ])
  )
})
function select(selectedItem = item, expiresAt = Date.now() + 5000) {
  return requestBrowserClientHistoryDocument(
    {
      viewer: 'host',
      operation: 'client-history-document',
      source,
      item: selectedItem
    },
    expiresAt
  )
}
function open() {
  render(<Owner />)
  fireEvent.focus(screen.getByRole('combobox'))
}
it('refuses a different supplied identity before invoking the existing conversion writer', async () => {
  open()
  await expect(select({ ...item, worktreeId: target.worktreeId })).rejects.toThrow('item_changed')
  expect(useAppStore.getState().activeWorktreeId).toBe(target.worktreeId)
  expect(useAppStore.getState().browserTabsByWorktree[item.worktreeId]).toBeUndefined()
})
it('refuses duplicate actual address owners before selecting either suggestion', async () => {
  render(
    <>
      <Owner />
      <Owner />
    </>
  )
  for (const input of screen.getAllByRole('combobox')) {
    fireEvent.focus(input)
  }
  await expect(select()).rejects.toThrow('ambiguous')
  expect(useAppStore.getState().activeWorktreeId).toBe(target.worktreeId)
})
it.each(['history', 'workspace'] as const)(
  'rejects %s ABA between offer collection and selection',
  async (kind) => {
    open()
    const originalDispatch = window.dispatchEvent.bind(window)
    vi.spyOn(window, 'dispatchEvent').mockImplementation((event) => {
      const result = originalDispatch(event)
      if (event.type === 'orca:browser-client-history-document') {
        const state = useAppStore.getState()
        if (kind === 'history') {
          useAppStore.setState({ workspaceDocHistory: [] })
          useAppStore.setState({ workspaceDocHistory: state.workspaceDocHistory })
        } else {
          useAppStore.setState({ activeWorktreeId: 'folder:foreign' })
          useAppStore.setState({ activeWorktreeId: target.worktreeId })
        }
      }
      return result
    })
    await expect(select()).rejects.toThrow('owner_changed')
    expect(useAppStore.getState().activeWorktreeId).toBe(target.worktreeId)
    expect(useAppStore.getState().browserTabsByWorktree[item.worktreeId]).toBeUndefined()
  }
)
it('refuses an expired request without changing the selected workspace', async () => {
  open()
  await expect(select(item, Date.now() - 1)).rejects.toThrow('request_expired')
  expect(useAppStore.getState().activeWorktreeId).toBe(target.worktreeId)
})
it('activates an existing document by the history identity instead of creating a second preview', async () => {
  const existing = useAppStore.getState().createBrowserTab(item.worktreeId, '', {
    docLocation: { kind: 'workspace-doc', worktreeId: item.worktreeId, filePath }
  })
  useAppStore.getState().setActiveWorktree(target.worktreeId)
  open()
  let receipt: unknown
  await act(async () => {
    receipt = await select()
  })
  expect(receipt).toMatchObject({ selected: true, documentWorkspaceId: existing.id, item })
  expect(useAppStore.getState().browserTabsByWorktree[item.worktreeId]).toHaveLength(1)
})
it('converts the source page through the same-workspace history callback', async () => {
  const sameWorkspaceItem = { ...item, worktreeId: target.worktreeId }
  useAppStore.setState({
    workspaceDocHistory: [
      {
        docLocation: { kind: 'workspace-doc', worktreeId: target.worktreeId, filePath },
        title: 'Fixture',
        lastVisitedAt: 1,
        visitCount: 1
      }
    ]
  })
  const originalWorkspaceId = useAppStore.getState().activeBrowserTabIdByWorktree[target.worktreeId]
  open()
  let receipt: unknown
  await act(async () => {
    receipt = await select(sameWorkspaceItem)
  })
  expect(receipt).toMatchObject({
    selected: true,
    item: sameWorkspaceItem,
    documentWorkspaceId: originalWorkspaceId
  })
  const state = useAppStore.getState()
  const workspace = state.browserTabsByWorktree[target.worktreeId]?.find(
    (row) => row.id === originalWorkspaceId
  )
  expect(
    state.browserPagesByWorkspace[originalWorkspaceId ?? '']?.find(
      (page) => page.id === workspace?.activePageId
    )?.docLocation
  ).toEqual({ kind: 'workspace-doc', worktreeId: target.worktreeId, filePath })
})
it('does not acknowledge a foreign workspace ABA inside the original conversion callback', async () => {
  open()
  let injected = false
  const unsubscribe = useAppStore.subscribe((state) => {
    if (!injected && state.activeWorktreeId === item.worktreeId) {
      injected = true
      useAppStore.setState({ activeWorktreeId: 'folder:foreign' })
      useAppStore.setState({ activeWorktreeId: item.worktreeId })
    }
  })
  try {
    await act(async () => {
      await expect(select()).rejects.toThrow('effect_unknown')
    })
    expect(injected).toBe(true)
  } finally {
    unsubscribe()
  }
})
it('refuses draft ABA before React commits the queued address changes', async () => {
  open()
  const input = screen.getByRole('combobox')
  const originalDispatch = window.dispatchEvent.bind(window)
  vi.spyOn(window, 'dispatchEvent').mockImplementation((event) => {
    const result = originalDispatch(event)
    if (event.type === 'orca:browser-client-history-document') {
      fireEvent.change(input, { target: { value: 'different' } })
      fireEvent.change(input, { target: { value: '' } })
    }
    return result
  })
  await act(async () => {
    await expect(select()).rejects.toThrow('owner_changed')
  })
  expect(useAppStore.getState().activeWorktreeId).toBe(target.worktreeId)
})
