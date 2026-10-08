// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { AgentPaneThread } from '@/components/activity/activity-thread-types'
import {
  makeRepo,
  makeTab,
  makeWorktree
} from '@/components/activity/ActivityPrototypePage-test-fixtures'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../shared/constants'
import { readActivitySelectionDestination } from './activity-selection-destination'

const leafId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
let thread: AgentPaneThread
let leaf: HTMLElement
let root: HTMLElement
let helper: HTMLTextAreaElement
beforeEach(() => {
  const tab = makeTab()
  thread = {
    tab,
    worktree: makeWorktree(),
    repo: makeRepo(),
    paneKey: `${tab.id}:${leafId}`,
    paneTitle: '',
    agentType: 'claude',
    events: [],
    latestEvent: null,
    latestTimestamp: 1,
    currentAgentState: null,
    currentAgentEntry: null,
    unread: true,
    responsePreview: ''
  }
  root = document.createElement('div')
  root.dataset.renderedActiveWorktreeId = thread.worktree.id
  root.dataset.renderedActiveExecutionHostId = 'local'
  const tabRoot = document.createElement('div')
  tabRoot.dataset.terminalTabId = tab.id
  leaf = document.createElement('div')
  leaf.dataset.leafId = leafId
  leaf.dataset.ptyId = 'owned-pty'
  leaf.innerHTML =
    '<div class="xterm-screen"></div><textarea class="xterm-helper-textarea"></textarea>'
  tabRoot.append(leaf)
  root.append(tabRoot)
  document.body.append(root)
  const input = leaf.querySelector('textarea')
  if (!input) {
    throw new Error('fixture_input_missing')
  }
  helper = input
  helper.focus()
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(0, 0, 800, 600)
  )
})
afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})
it('requires the exact connected terminal leaf, PTY, screen and owned active helper', () => {
  expect(readActivitySelectionDestination(thread, 'local')).toMatchObject({
    reached: 'terminal-pane'
  })
  delete leaf.dataset.ptyId
  expect(readActivitySelectionDestination(thread, 'local')).toMatchObject({ reached: 'none' })
  leaf.dataset.ptyId = 'owned-pty'
  root.remove()
  expect(readActivitySelectionDestination(thread, 'local')).toMatchObject({ reached: 'none' })
})
it('does not require sibling split panes to be hidden', () => {
  leaf.parentElement?.append(document.createElement('div'))
  expect(readActivitySelectionDestination(thread, 'local')).toMatchObject({
    reached: 'terminal-pane'
  })
})
it.each(['tab', 'leaf', 'workspace', 'focus', 'hidden', 'inert', 'opacity'])(
  'rejects mismatched or retained %s',
  (kind) => {
    if (kind === 'tab') {
      thread = { ...thread, tab: { ...thread.tab, id: 'other' } }
    }
    if (kind === 'leaf') {
      leaf.dataset.leafId = 'other'
    }
    if (kind === 'workspace') {
      root.dataset.renderedActiveWorktreeId = 'other'
    }
    if (kind === 'focus') {
      const sibling = document.createElement('textarea')
      root.append(sibling)
      sibling.focus()
    }
    if (kind === 'hidden') {
      root.setAttribute('aria-hidden', 'true')
    }
    if (kind === 'inert') {
      root.inert = true
    }
    if (kind === 'opacity') {
      root.style.opacity = '0'
    }
    expect(readActivitySelectionDestination(thread, 'local')).toMatchObject({ reached: 'none' })
  }
)
it('accepts floating exact focus under the panel without a main workspace root', () => {
  thread = { ...thread, worktree: { ...thread.worktree, id: FLOATING_TERMINAL_WORKTREE_ID } }
  delete root.dataset.renderedActiveWorktreeId
  root.dataset.floatingTerminalPanel = ''
  expect(readActivitySelectionDestination(thread, 'local')).toMatchObject({
    reached: 'terminal-pane'
  })
  root.setAttribute('aria-hidden', 'true')
  expect(readActivitySelectionDestination(thread, 'local')).toMatchObject({ reached: 'none' })
})
it('checks the native chat cover focus rather than its hidden xterm', () => {
  const cover = document.createElement('div')
  cover.className = 'native-chat-pane-shell'
  cover.tabIndex = -1
  leaf.append(cover)
  expect(readActivitySelectionDestination(thread, 'local')).toMatchObject({ reached: 'none' })
  cover.focus()
  expect(readActivitySelectionDestination(thread, 'local')).toMatchObject({
    reached: 'terminal-pane',
    contentState: 'unknown'
  })
  cover.style.visibility = 'hidden'
  expect(readActivitySelectionDestination(thread, 'local')).toMatchObject({ reached: 'none' })
})
it.each(['ready', 'empty', 'loading', 'error', 'future'])(
  'reports structured %s without inventing remote activation acknowledgement',
  (kind) => {
    root.innerHTML = ''
    const overlay = document.createElement('div')
    overlay.dataset.structuredAgentSessionOverlayTabId = thread.tab.id
    const chat = document.createElement('div')
    chat.dataset.nativeChatRoot = 'true'
    chat.dataset.nativeChatViewState = `known:${kind}`
    overlay.append(chat)
    root.append(overlay)
    const expected = kind === 'ready' || kind === 'empty' ? 'structured-tab' : 'none'
    expect(readActivitySelectionDestination(thread, 'local')).toMatchObject({
      reached: expected,
      contentState: kind === 'future' ? 'unknown' : kind
    })
    chat.dataset.nativeChatViewState = `unread:${kind}`
    expect(readActivitySelectionDestination(thread, 'local')).toMatchObject({ reached: 'none' })
    chat.dataset.nativeChatViewState = `known:${kind}`
    overlay.setAttribute('aria-hidden', 'true')
    expect(readActivitySelectionDestination(thread, 'local')).toMatchObject({ reached: 'none' })
  }
)

it('rejects a different resolved DOM host even when workspace and tab ids match', () => {
  expect(readActivitySelectionDestination(thread, 'ssh:other')).toMatchObject({ reached: 'none' })
  root.dataset.renderedActiveExecutionHostId = 'ssh:other'
  expect(readActivitySelectionDestination(thread, 'local')).toMatchObject({ reached: 'none' })
})
