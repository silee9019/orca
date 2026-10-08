import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import type { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import type { RuntimeNotifier } from '../../src/main/runtime/runtime-notifier-contract'

type Listener = (event: unknown, ...values: unknown[]) => void
const hoisted = vi.hoisted(() => {
  const toRenderer = new Map<string, Set<Listener>>()
  const toMain = new Map<string, Set<Listener>>()
  const sender: { current: unknown } = { current: null }
  const store: { current: Record<string, unknown> } = { current: {} }
  const add = (map: Map<string, Set<Listener>>, channel: string, listener: Listener) => {
    map.set(channel, (map.get(channel) ?? new Set()).add(listener))
  }
  return {
    toRenderer,
    toMain,
    sender,
    // Replaces only Electron's IPC; the notifier, preload, renderer bridges and close relay run for real
    // while store actions, persistence and focus surfaces are mocked at their boundary.
    ipcMain: {
      on: (channel: string, listener: Listener) => add(toMain, channel, listener),
      removeListener: (channel: string, listener: Listener) => toMain.get(channel)?.delete(listener)
    },
    ipcRenderer: {
      on: (channel: string, listener: Listener) => add(toRenderer, channel, listener),
      removeListener: (channel: string, listener: Listener) =>
        toRenderer.get(channel)?.delete(listener),
      send: (channel: string, payload: unknown) => {
        for (const listener of toMain.get(channel) ?? []) {
          listener({ sender: sender.current }, payload)
        }
      }
    },
    closeTerminalTab: vi.fn(),
    applyClosedTerminalLeafNotice: vi.fn(),
    persistWorkspaceSession: vi.fn(async () => {}),
    focusRuntimeTerminalSurface: vi.fn(() => true),
    hasRegisteredTab: vi.fn(() => false),
    mountBackground: vi.fn(),
    store
  }
})

vi.mock('electron', () => ({
  ipcMain: hoisted.ipcMain,
  ipcRenderer: hoisted.ipcRenderer,
  webFrame: {}
}))
// Its import-time window listeners are unrelated to terminal events.
vi.mock('../../src/preload/preload-runtime-support', () => ({ subscribeNativeFileDrop: vi.fn() }))
vi.mock('../../src/main/ipc/worktree-change-invalidators', () => ({
  runWorktreeChangeInvalidators: vi.fn()
}))
vi.mock('../../src/main/window/mobile-markdown-request-relay', () => ({
  requestMobileMarkdownFromRenderer: vi.fn()
}))
vi.mock('../../src/main/window/renderer-document-navigation', () => ({
  registerRendererDocumentNavigation: vi.fn()
}))
vi.mock('../../src/main/window/session-tab-close-request-relay', () => ({
  requestSessionTabCloseFromRenderer: vi.fn()
}))
vi.mock('../../src/renderer/src/store', () => ({
  useAppStore: { getState: () => hoisted.store.current }
}))
vi.mock('../../src/renderer/src/runtime/sync-runtime-graph', () => ({
  focusRuntimeTerminalSurface: hoisted.focusRuntimeTerminalSurface,
  hasRegisteredRuntimeTerminalTab: hoisted.hasRegisteredTab
}))
vi.mock('../../src/renderer/src/lib/focus-terminal-tab-surface', () => ({
  focusTerminalTabSurface: vi.fn()
}))
vi.mock('../../src/renderer/src/components/terminal/terminal-tab-actions', () => ({
  closeTerminalTab: hoisted.closeTerminalTab
}))
vi.mock('../../src/renderer/src/components/terminal-pane/closed-terminal-leaf-notice', () => ({
  applyClosedTerminalLeafNotice: hoisted.applyClosedTerminalLeafNotice
}))
vi.mock('../../src/renderer/src/lib/workspace-session', () => ({
  buildWorkspaceSessionPayload: () => ({ payload: 'session' })
}))
vi.mock('../../src/renderer/src/lib/workspace-session-host-persistence', () => ({
  persistWorkspaceSessionByHost: hoisted.persistWorkspaceSession
}))
vi.mock('../../src/renderer/src/components/sidebar/sleep-worktree-flow', () => ({
  runSleepWorktree: vi.fn()
}))
vi.mock('../../src/renderer/src/components/terminal/background-terminal-worktree-mount', () => ({
  requestBackgroundTerminalWorktreeMount: hoisted.mountBackground
}))

import { registerRuntimeWindowLifecycle } from '../../src/main/window/runtime-window-lifecycle'
import { uiClipboardAndWindowControlsApi } from '../../src/preload/api/ui-bridge-clipboard-and-window-controls'
import { uiTerminalAndSessionTabsApi } from '../../src/preload/api/ui-bridge-terminal-and-session-tabs'
import { registerMobileAndTerminalCloseIpcBridge } from '../../src/renderer/src/hooks/ipc-events/mobile-terminal-close-ipc-bridge'
import { registerTerminalPresentationIpcBridge } from '../../src/renderer/src/hooks/ipc-events/terminal-presentation-ipc-bridge'
import { registerTerminalUiRoutingIpcBridge } from '../../src/renderer/src/hooks/ipc-events/terminal-ui-routing-ipc-bridge'
import { SPLIT_TERMINAL_PANE_EVENT } from '../../src/renderer/src/constants/terminal'
import { takeQueuedTerminalPaneSplitRequests } from '../../src/renderer/src/components/terminal-pane/terminal-pane-split-request-routing'

type Sent = [channel: string, payload: unknown]
let notifier: RuntimeNotifier
let sent: Sent[]
let store: Record<string, ReturnType<typeof vi.fn>>

function attach(): void {
  sent = []
  const attached: { notifier: RuntimeNotifier | null } = { notifier: null }
  const webContents = {
    isDestroyed: () => false,
    on: vi.fn(),
    send: (channel: string, payload: unknown) => {
      sent.push([channel, payload])
      for (const listener of hoisted.toRenderer.get(channel) ?? []) {
        listener({}, payload)
      }
    }
  }
  hoisted.sender.current = webContents
  const window = { id: 1, isDestroyed: () => false, on: vi.fn(), webContents }
  const runtime = {
    attachWindow: vi.fn(),
    markGraphReloadFailed: vi.fn(),
    setNotifier: (next: RuntimeNotifier | null) => {
      attached.notifier = next
    }
  }
  registerRuntimeWindowLifecycle(
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: registration and the close relay only read id, isDestroyed, on and webContents.
    window as unknown as BrowserWindow,
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: registration only calls the stubbed runtime members.
    runtime as unknown as OrcaRuntimeService
  )
  if (!attached.notifier) {
    throw new Error('runtime notifier was not attached')
  }
  notifier = attached.notifier
}

beforeEach(() => {
  hoisted.toRenderer.clear()
  hoisted.toMain.clear()
  hoisted.closeTerminalTab.mockReset()
  hoisted.applyClosedTerminalLeafNotice.mockReset()
  hoisted.persistWorkspaceSession.mockReset().mockResolvedValue(undefined)
  hoisted.focusRuntimeTerminalSurface.mockClear()
  hoisted.hasRegisteredTab.mockReset().mockReturnValue(false)
  hoisted.mountBackground.mockReset()
  store = {
    setTabCustomTitle: vi.fn(),
    setActiveView: vi.fn(),
    setActiveWorktree: vi.fn(),
    markWorktreeVisited: vi.fn(),
    recordWorktreeVisit: vi.fn(),
    setActiveTab: vi.fn(),
    revealWorktreeInSidebar: vi.fn()
  }
  hoisted.store.current = {
    ...store,
    isNavigatingHistory: false,
    tabsByWorktree: { 'wt-1': [{ id: 'tab-1' }], 'wt-2': [{ id: 'tab-2' }] },
    unifiedTabsByWorktree: {}
  }
  const preload = { ...uiTerminalAndSessionTabsApi, ...uiClipboardAndWindowControlsApi }
  vi.stubGlobal('window', {
    dispatchEvent: vi.fn(),
    api: {
      ui: new Proxy(preload, {
        get: (target, name: string) => (name in target ? target[name] : () => () => {})
      }),
      session: {}
    }
  })
  attach()
})

describe('runtime notifier channel payloads', () => {
  it('maps terminal creation with only the options that were supplied', () => {
    notifier.createTerminal('wt-1', {
      command: 'pnpm test',
      cwd: '/work',
      env: { A: '1' },
      title: 'Tests',
      presentation: 'background'
    })
    notifier.createTerminal('wt-1', {})
    expect(sent[0]).toEqual([
      'ui:createTerminal',
      {
        worktreeId: 'wt-1',
        command: 'pnpm test',
        cwd: '/work',
        env: { A: '1' },
        title: 'Tests',
        presentation: 'background'
      }
    ])
    const [, minimal] = sent[1]
    expect(minimal).toEqual({ worktreeId: 'wt-1' })
    expect(minimal).not.toHaveProperty('cwd')
    expect(minimal).not.toHaveProperty('env')
    expect(minimal).not.toHaveProperty('presentation')
  })

  it('maps a split request with its source leaf, direction and new leaf id', () => {
    notifier.splitTerminal('tab-1', 7, {
      direction: 'vertical',
      command: 'tail -f log',
      worktreeId: 'wt-1',
      sourceLeafId: 'leaf-a',
      telemetrySource: 'command',
      newLeafId: 'leaf-b'
    })
    expect(sent).toEqual([
      [
        'ui:splitTerminal',
        {
          tabId: 'tab-1',
          paneRuntimeId: 7,
          direction: 'vertical',
          command: 'tail -f log',
          worktreeId: 'wt-1',
          sourceLeafId: 'leaf-a',
          telemetrySource: 'command',
          newLeafId: 'leaf-b'
        }
      ]
    ])
  })

  it.each([
    ['createTerminal', 'onCreateTerminal', () => notifier.createTerminal('wt-1', { title: 'T' })],
    [
      'splitTerminal',
      'onSplitTerminal',
      () => notifier.splitTerminal('tab-1', 7, { direction: 'horizontal', newLeafId: 'leaf-b' })
    ]
  ] as const)('delivers %s to a preload subscriber unchanged', (_name, subscribe, emit) => {
    const received = vi.fn()
    uiTerminalAndSessionTabsApi[subscribe](received)
    emit()
    expect(received).toHaveBeenCalledExactlyOnceWith(sent[0][1])
  })
})

describe('notifier → preload → renderer handler', () => {
  let unsubs: (() => void)[]
  beforeEach(() => {
    unsubs = []
    registerTerminalUiRoutingIpcBridge(unsubs)
    registerMobileAndTerminalCloseIpcBridge(unsubs, vi.fn())
  })

  it.each(['Build', null])('applies a CLI rename as the tab custom title %s', (title) => {
    notifier.renameTerminal('tab-1', title)
    expect(sent).toEqual([['ui:renameTerminal', { tabId: 'tab-1', title }]])
    expect(store.setTabCustomTitle).toHaveBeenCalledExactlyOnceWith('tab-1', title)
  })

  it('applies a CLI switch by activating the worktree and tab and focusing the leaf', () => {
    notifier.focusTerminal('tab-1', 'wt-1', 'leaf-a')
    expect(sent).toEqual([
      ['ui:focusTerminal', { tabId: 'tab-1', worktreeId: 'wt-1', leafId: 'leaf-a' }]
    ])
    expect(store.setActiveView).toHaveBeenCalledWith('terminal')
    expect(store.setActiveWorktree).toHaveBeenCalledWith('wt-1')
    expect(store.setActiveTab).toHaveBeenCalledWith('tab-1')
    expect(store.revealWorktreeInSidebar).toHaveBeenCalledWith('wt-1')
    expect(hoisted.focusRuntimeTerminalSurface).toHaveBeenCalledWith('tab-1', 'leaf-a', 'wt-1')
  })

  it('closes a whole tab without the confirmation modal and only drops a pane for a pane close', () => {
    notifier.closeTerminal('tab-1')
    expect(sent).toEqual([['ui:closeTerminal', { kind: 'tab', tabId: 'tab-1' }]])
    expect(hoisted.closeTerminalTab).toHaveBeenCalledExactlyOnceWith('tab-1', {
      skipRunningProcessConfirm: true
    })
    expect(hoisted.applyClosedTerminalLeafNotice).not.toHaveBeenCalled()
    sent.length = 0
    hoisted.closeTerminalTab.mockClear()
    notifier.closeTerminalPane?.('tab-1', 'leaf-b')
    expect(sent).toEqual([['ui:closeTerminal', { kind: 'pane', tabId: 'tab-1', leafId: 'leaf-b' }]])
    expect(hoisted.applyClosedTerminalLeafNotice).toHaveBeenCalledExactlyOnceWith('tab-1', 'leaf-b')
    expect(hoisted.closeTerminalTab).not.toHaveBeenCalled()
  })

  it('settles a tab close request only after the renderer persisted the closed session', async () => {
    const persisted = Promise.withResolvers<void>()
    hoisted.persistWorkspaceSession.mockReturnValueOnce(persisted.promise)
    let settled = false
    const closed = notifier.closeTerminalTab?.('tab-1', { force: true })?.then(() => {
      settled = true
    })
    expect(sent).toHaveLength(1)
    expect(sent[0]).toEqual([
      'ui:terminalTabCloseRequest',
      { requestId: expect.any(String), tabId: 'tab-1', force: true }
    ])
    expect(hoisted.closeTerminalTab).toHaveBeenCalledExactlyOnceWith(
      'tab-1',
      expect.objectContaining({ rejectPinned: true, force: true })
    )
    hoisted.closeTerminalTab.mock.calls[0][1].onClosed()
    await vi.waitFor(() => expect(hoisted.persistWorkspaceSession).toHaveBeenCalledOnce())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(settled).toBe(false)
    persisted.resolve()
    await closed
    expect(settled).toBe(true)
  })

  it('rejects a tab close request when the renderer refuses a pinned tab', async () => {
    const closed = notifier.closeTerminalTab?.('tab-1')
    hoisted.closeTerminalTab.mock.calls[0][1].onCancel()
    await expect(closed).rejects.toThrow('terminal_tab_pinned')
    expect(hoisted.persistWorkspaceSession).not.toHaveBeenCalled()
  })

  it('queues a CLI split for the owning worktree until its tab mounts, then asks for the mount', () => {
    notifier.splitTerminal('tab-1', 7, {
      direction: 'vertical',
      command: 'tail -f log',
      sourceLeafId: 'leaf-a',
      telemetrySource: 'command',
      newLeafId: 'leaf-b'
    })
    expect(hoisted.mountBackground).toHaveBeenCalledExactlyOnceWith({
      worktreeId: 'wt-1',
      tabIds: ['tab-1']
    })
    expect(takeQueuedTerminalPaneSplitRequests('tab-1', 'wt-1')).toEqual([
      {
        tabId: 'tab-1',
        worktreeId: 'wt-1',
        paneRuntimeId: 7,
        direction: 'vertical',
        command: 'tail -f log',
        sourceLeafId: 'leaf-a',
        telemetrySource: 'command',
        newLeafId: 'leaf-b'
      }
    ])
  })

  it('dispatches a CLI split straight to a mounted tab and never to another worktree', () => {
    hoisted.hasRegisteredTab.mockReturnValue(true)
    notifier.splitTerminal('tab-1', 7, { direction: 'horizontal', newLeafId: 'leaf-b' })
    const [event] = vi.mocked(window.dispatchEvent).mock.calls[0] ?? []
    expect(event?.type).toBe(SPLIT_TERMINAL_PANE_EVENT)
    expect(event).toMatchObject({
      detail: { tabId: 'tab-1', worktreeId: 'wt-1', direction: 'horizontal', newLeafId: 'leaf-b' }
    })
    expect(hoisted.mountBackground).not.toHaveBeenCalled()

    vi.mocked(window.dispatchEvent).mockClear()
    notifier.splitTerminal('tab-2', 8, { direction: 'horizontal', worktreeId: 'wt-1' })
    expect(window.dispatchEvent).not.toHaveBeenCalled()
    expect(hoisted.mountBackground).not.toHaveBeenCalled()
    expect(takeQueuedTerminalPaneSplitRequests('tab-2')).toEqual([])
  })

  it('stops delivering after the renderer unsubscribes', () => {
    for (const unsubscribe of unsubs) {
      unsubscribe()
    }
    notifier.renameTerminal('tab-1', 'Late')
    notifier.closeTerminal('tab-1')
    expect(store.setTabCustomTitle).not.toHaveBeenCalled()
    expect(hoisted.closeTerminalTab).not.toHaveBeenCalled()
  })
})

describe('CLI terminal create (reveal) closed loop', () => {
  type Tab = { id: string; ptyId?: string | null; title?: string }
  let state: {
    tabsByWorktree: Record<string, Tab[]>
    terminalLayoutsByTabId: Record<string, unknown>
    ptyIdsByTabId: Record<string, string[]>
    createTab: ReturnType<typeof vi.fn>
    setTabLayout: ReturnType<typeof vi.fn>
    setTabCustomTitle: ReturnType<typeof vi.fn>
  }
  const reveal = {
    ptyId: 'pty-1',
    tabId: 'tab-1',
    leafId: 'leaf-1',
    title: 'cli shell',
    presentation: 'background' as const,
    activate: false,
    expectedProcessIdentity: { terminalHandle: 'handle-1', incarnationId: 'incarnation-1' }
  }

  beforeEach(() => {
    state = {
      tabsByWorktree: {},
      terminalLayoutsByTabId: {},
      ptyIdsByTabId: {},
      createTab: vi.fn((worktreeId: string, _group, _type, options?: { id?: string }) => {
        const tab = { id: options?.id ?? 'tab-new', ptyId: null, title: 'Terminal 1' }
        state.tabsByWorktree[worktreeId] = [...(state.tabsByWorktree[worktreeId] ?? []), tab]
        return tab
      }),
      setTabLayout: vi.fn((tabId: string, layout: unknown) => {
        state.terminalLayoutsByTabId[tabId] = layout
      }),
      setTabCustomTitle: vi.fn()
    }
    hoisted.store.current = new Proxy(state, {
      get: (target, name: string) => (name in target ? target[name] : vi.fn())
    })
    registerTerminalPresentationIpcBridge([])
  })

  it('hands the CLI the identity the renderer actually bound for the revealed terminal', async () => {
    await expect(notifier.revealTerminalSession?.('wt-1', reveal)).resolves.toEqual({
      tabId: 'tab-1',
      title: 'cli shell',
      identity: { worktreeId: 'wt-1', tabId: 'tab-1', leafId: 'leaf-1', ptyId: 'pty-1' }
    })
    expect(sent[0]).toEqual([
      'ui:createTerminal',
      expect.objectContaining({
        requestId: expect.any(String),
        worktreeId: 'wt-1',
        ptyId: 'pty-1',
        tabId: 'tab-1',
        leafId: 'leaf-1',
        presentation: 'background',
        activate: false
      })
    ])
    expect(state.createTab).toHaveBeenCalledWith(
      'wt-1',
      undefined,
      undefined,
      expect.objectContaining({ id: 'tab-1', initialPtyId: 'pty-1', activate: false })
    )
    expect(state.terminalLayoutsByTabId['tab-1']).toMatchObject({
      ptyIdsByLeafId: { 'leaf-1': 'pty-1' }
    })
    expect(state.setTabCustomTitle).toHaveBeenCalledWith('tab-1', 'cli shell', {
      recordInteraction: false
    })
    expect(hoisted.mountBackground).toHaveBeenCalledExactlyOnceWith({
      worktreeId: 'wt-1',
      tabIds: ['tab-1']
    })
  })

  it('refuses a reveal whose renderer tab differs from the pre-minted identity', async () => {
    state.createTab.mockImplementation((worktreeId: string) => {
      state.tabsByWorktree[worktreeId] = [{ id: 'other-tab' }]
      return { id: 'other-tab' }
    })
    await expect(notifier.revealTerminalSession?.('wt-1', reveal)).rejects.toThrow(
      'terminal_reveal_identity_mismatch'
    )
  })

  it('surfaces a renderer failure to the CLI instead of timing out', async () => {
    state.createTab.mockImplementation(() => {
      throw new Error('Terminal tab could not be created')
    })
    await expect(notifier.revealTerminalSession?.('wt-1', reveal)).rejects.toThrow(
      'Terminal tab could not be created'
    )
  })
})
