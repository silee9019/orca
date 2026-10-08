/** @vitest-environment happy-dom */
import { act, cleanup, render } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { tmpdir } from 'node:os'
import type { DragStartEvent } from '@dnd-kit/core'
import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { createRemotePaneCliSocket } from './browser-remote-pane-cli-socket.test-fixture'
import { parseArgs, validateCommandAndFlags } from '../../src/cli/args'
import { BROWSER_TAB_DROP_COMMAND_SPECS } from '../../src/cli/specs/browser-tab-drop'
import { BROWSER_TAB_DROP_HANDLERS } from '../../src/cli/handlers/browser-tab-drop'
import { getDefaultSettings } from '../../src/shared/constants'
import type { Tab } from '../../src/shared/tab-types'
import type { BrowserTab as BrowserWorkspace } from '../../src/shared/browser-workspace-types'
import { TooltipProvider } from '../../src/renderer/src/components/ui/tooltip'
import { useAppStore } from '../../src/renderer/src/store'
import BrowserTab from '../../src/renderer/src/components/tab-bar/BrowserTab'
import { useTabDragSplit } from '../../src/renderer/src/components/tab-group/useTabDragSplit'
import { applyBrowserPlacementViewerAction } from '../../src/renderer/src/runtime/browser-placement-viewer-actions'
import { isBrowserPlacementViewerCommand } from '../../src/renderer/src/runtime/browser-placement-viewer-command'
vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {} })
}))
vi.mock('../../src/renderer/src/components/tab-bar/use-tab-strip-slot-props', () => ({
  useTabStripSlotProps: () => ({})
}))
vi.mock('../../src/renderer/src/components/tab-bar/use-browser-tab-ui-commands', () => ({
  useBrowserTabUiCommands: () => {}
}))
vi.mock('../../src/renderer/src/lib/worktree-runtime-owner', () => ({
  getRuntimeEnvironmentIdForWorktree: () => null
}))
vi.mock('../../src/renderer/src/runtime/web-runtime-session-environment', () => ({
  isWebRuntimeSessionActive: () => false,
  captureWebSessionIntentOwner: () => ({ pairingRevision: 0 })
}))
vi.mock('../../src/renderer/src/runtime/web-runtime-session', () => ({
  isWebRuntimeSessionActive: () => false,
  moveWebRuntimeSessionTab: vi.fn()
}))
const initial = useAppStore.getState()
const previousApi = Object.getOwnPropertyDescriptor(window, 'api')
let gesture: ReturnType<typeof useTabDragSplit> | undefined
function GestureOwner() {
  gesture = useTabDragSplit({ worktreeId: 'folder' })
  return null
}
function tab(id: string, groupId: string): Tab {
  return {
    id,
    groupId,
    worktreeId: 'folder',
    contentType: 'browser',
    entityId: id,
    label: id,
    customLabel: null,
    color: null,
    sortOrder: 0,
    createdAt: 0
  }
}
function workspace(id: string): BrowserWorkspace {
  return {
    id,
    worktreeId: 'folder',
    label: id,
    sessionProfileId: null,
    activePageId: null,
    pageIds: [],
    url: 'https://example.com/',
    title: id,
    loading: false,
    faviconUrl: null,
    canGoBack: false,
    canGoForward: false,
    loadError: null,
    createdAt: 0
  }
}
function DropOwner() {
  return createElement(
    TooltipProvider,
    null,
    createElement(BrowserTab, {
      tab: workspace('a'),
      isActive: false,
      isPinned: false,
      hasTabsToRight: true,
      hasTabsToLeft: false,
      tabCount: 3,
      onActivate: () => {},
      onClose: () => {},
      onCloseOthers: () => {},
      onCloseToLeft: () => {},
      onCloseToRight: () => {},
      onTogglePin: () => {},
      dragData: {
        kind: 'tab',
        worktreeId: 'folder',
        groupId: 'left',
        unifiedTabId: 'a',
        visibleTabId: 'a',
        tabType: 'browser',
        label: 'a'
      }
    })
  )
}
beforeEach(() => {
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { ui: { set: vi.fn().mockResolvedValue(undefined) } }
  })
  useAppStore.setState({
    settings: getDefaultSettings(tmpdir()),
    persistedUIReady: true,
    activeModal: 'none',
    activeWorktreeId: 'folder',
    activeGroupIdByWorktree: { folder: 'left' },
    activeTabType: 'browser',
    activeTabTypeByWorktree: { folder: 'browser' },
    activeBrowserTabId: 'b',
    activeBrowserTabIdByWorktree: { folder: 'b' },
    browserTabsByWorktree: { folder: [workspace('a'), workspace('b'), workspace('c')] },
    browserPagesByWorkspace: {},
    remoteBrowserPageHandlesByPageId: {},
    unifiedTabsByWorktree: { folder: [tab('a', 'left'), tab('b', 'left'), tab('c', 'right')] },
    groupsByWorktree: {
      folder: [
        { id: 'left', worktreeId: 'folder', activeTabId: 'b', tabOrder: ['a', 'b'] },
        { id: 'right', worktreeId: 'folder', activeTabId: 'c', tabOrder: ['c'] }
      ]
    },
    layoutByWorktree: {
      folder: {
        type: 'split',
        direction: 'horizontal',
        ratio: 0.5,
        first: { type: 'leaf', groupId: 'left' },
        second: { type: 'leaf', groupId: 'right' }
      }
    }
  })
})
afterEach(() => {
  act(() => gesture?.onDragCancel())
  cleanup()
  useAppStore.setState(initial, true)
  expect(useAppStore.getState()).toBe(initial)
  vi.restoreAllMocks()
  gesture = undefined
  if (previousApi) {
    Object.defineProperty(window, 'api', previousApi)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})
it.each(['drop', 'cancel'] as const)(
  'passes the real parser/socket/dispatcher/service and mounted %s owner',
  async (action) => {
    render(createElement(action === 'drop' ? DropOwner : GestureOwner))
    if (action === 'cancel') {
      const event: DragStartEvent = {
        activatorEvent: new Event('pointerdown'),
        active: {
          id: 'a',
          data: {
            current: {
              kind: 'tab',
              worktreeId: 'folder',
              groupId: 'left',
              unifiedTabId: 'a',
              visibleTabId: 'a',
              tabType: 'browser',
              label: 'a'
            }
          },
          rect: { current: { initial: null, translated: null } }
        }
      }
      act(() => gesture?.onDragStart(event))
    }
    const runtime = new OrcaRuntimeService()
    let notifyStarted = () => {}
    const initiated = new Promise<void>((resolve) => {
      notifyStarted = resolve
    })
    const delivered: unknown[] = []
    runtime.setNotifier({
      browserViewer: (command) => {
        notifyStarted()
        delivered.push(command)
        expect(command.viewer).toBe('host')
        if (!isBrowserPlacementViewerCommand(command)) {
          throw new Error('wrong_placement_command')
        }
        return applyBrowserPlacementViewerAction(command, Date.now() + 2000)
      }
    })
    const cli = await createRemotePaneCliSocket(runtime)
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    const specs = BROWSER_TAB_DROP_COMMAND_SPECS
    const parsed = parseArgs(
      [
        'browser',
        ...(action === 'drop' ? ['tab-drop'] : ['tab-drag', 'cancel']),
        '--viewer',
        'host',
        '--workspace',
        'a',
        '--worktree',
        'folder',
        '--group',
        'left',
        '--unified-tab',
        'a',
        ...(action === 'drop' ? ['--kind', 'pane', '--destination-group', 'right'] : [])
      ],
      specs.map((spec) => spec.path),
      specs
    )
    validateCommandAndFlags(specs, parsed)
    const run = () =>
      BROWSER_TAB_DROP_HANDLERS[parsed.commandPath.join(' ')]({
        ...parsed,
        client: cli.client,
        cwd: tmpdir(),
        json: true
      })
    try {
      let completion: Promise<void> | undefined
      await act(async () => {
        completion = run()
        void completion.catch(() => {})
        await Promise.race([initiated, completion])
      })
      await completion
      expect(delivered).toHaveLength(1)
      expect(delivered[0]).toMatchObject({
        viewer: 'host',
        operation: action === 'drop' ? 'tab-drop' : 'tab-drag-cancel'
      })
      if (action === 'drop') {
        expect(useAppStore.getState().groupsByWorktree.folder[1].tabOrder).toEqual(['c', 'a'])
        expect(output.mock.lastCall?.[0]).toMatch(/"moved":\s*true/)
      } else {
        expect(gesture?.activeDrag).toBeNull()
        expect(gesture?.isTabDragActiveRef.current).toBe(false)
        expect(output.mock.lastCall?.[0]).toMatch(/"cancelled":\s*true/)
      }
      const after = useAppStore.getState()
      await expect(
        cli.client.call('ui.browserViewer', {
          viewer: 'other',
          operation: action === 'drop' ? 'tab-drop' : 'tab-drag-cancel',
          target: {
            workspace: 'a',
            worktree: 'folder',
            group: 'left',
            unifiedTab: 'a',
            environmentId: null
          },
          ...(action === 'drop' ? { destination: { kind: 'pane', group: 'right' } } : {})
        })
      ).rejects.toMatchObject({ code: 'invalid_argument' })
      expect(delivered).toHaveLength(1)
      expect(useAppStore.getState()).toBe(after)
      cli.useLegacyPeer()
      await expect(run()).rejects.toMatchObject({ code: 'method_not_found' })
      expect(delivered).toHaveLength(1)
    } finally {
      await cli.close()
      output.mockRestore()
    }
  }
)
