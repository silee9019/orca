// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { getDefaultSettings } from '../../src/shared/constants'
import { ContextMenu } from '@/components/ui/context-menu'
import { FileExplorerRowContextMenu } from '../../src/renderer/src/components/right-sidebar/file-explorer-row-context-menu'
import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { createElement } from 'react'
import { z } from 'zod'
import {
  WorkspaceFileOpenState,
  type WorkspaceFileOpenCommand
} from '../../src/shared/rpc-contract/workspace-file-open-params'
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    ipcMain: new EventEmitter(),
    BrowserWindow: class extends EventEmitter {
      id = 74
      isDestroyed = () => false
      webContents = Object.assign(new EventEmitter(), { isDestroyed: () => false, send: vi.fn() })
    }
  }
})
import { BrowserWindow, ipcMain } from 'electron'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { requestBrowserViewerFromRenderer } from '../../src/main/window/browser-viewer-request-relay'
import { applyBrowserViewerRequest } from '../../src/renderer/src/runtime/browser-viewer-bridge'
import type { BrowserViewerRequest } from '../../src/shared/browser-viewer-command'
import { createRemotePaneCliSocket } from './browser-remote-pane-cli-socket.test-fixture'

import type { TreeNode } from '../../src/renderer/src/components/right-sidebar/file-explorer-types'
const initial = useAppStore.getInitialState()
const originalApi = Object.getOwnPropertyDescriptor(window, 'api')
afterEach(() => {
  cleanup()
  useAppStore.setState(initial, true)
  if (originalApi) {
    Object.defineProperty(window, 'api', originalApi)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})
it.each(['local', 'ssh:fixture', 'runtime:fixture'] as const)(
  'reuses the actual mounted explorer context callback for %s without reading files on the wrong host',
  async (host) => {
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { ui: { set: async () => {} } }
    })
    const connectionId = host === 'ssh:fixture' ? 'fixture' : null
    useAppStore.setState({
      settings: getDefaultSettings('/fixture/home'),
      persistedUIReady: true,
      folderWorkspaces: [
        {
          id: 'files',
          projectGroupId: 'project',
          name: 'Folder',
          folderPath: '/fixture/folder',
          executionHostId: host,
          connectionId,
          linkedTask: null,
          comment: '',
          isArchived: false,
          isUnread: false,
          isPinned: false,
          sortOrder: 0,
          lastActivityAt: 0,
          createdAt: 0,
          updatedAt: 0
        }
      ]
    })
    const worktree = useAppStore.getState().getKnownWorktreeById('folder:files', host)
    if (!worktree) {
      throw new Error('Missing folder workspace')
    }
    useAppStore.setState({
      activeWorktreeId: worktree.id,
      activeRepoId: worktree.repoId,
      activeWorkspaceExecutionHostId: host,
      repos: [
        {
          id: worktree.repoId,
          path: worktree.path,
          displayName: 'Folder',
          badgeColor: '',
          addedAt: 0,
          executionHostId: host,
          connectionId,
          kind: 'folder'
        }
      ],
      groupsByWorktree: {
        [worktree.id]: [{ id: 'group', worktreeId: worktree.id, activeTabId: null, tabOrder: [] }]
      }
    })
    const node: TreeNode = {
      name: 'index.html',
      path: '/fixture/folder/index.html',
      relativePath: 'index.html',
      isDirectory: false,
      depth: 0,
      operationOwner:
        host === 'local'
          ? { kind: 'local' }
          : host === 'ssh:fixture'
            ? { kind: 'ssh', connectionId: 'fixture' }
            : { kind: 'runtime', environmentId: 'fixture', executionHostId: host }
    }
    const props = {
      node,
      isExpanded: false,
      deleteShortcutLabel: '',
      connectionId,
      supportsFolderDownload: false,
      canOpenInOrcaBrowser: true,
      canCollapseFolderSubtree: false,
      targetDir: '/fixture/folder',
      targetDepth: 0,
      selectionSize: 1,
      onViewFile: () => {},
      onCopyPaths: () => {},
      onStartNew: () => {},
      onStartRename: () => {},
      onDuplicate: () => {},
      onAddFolderAsProject: () => {},
      canAddAsProject: false,
      onOpenInTerminal: () => {},
      onRequestDelete: () => {},
      onCollapseFolderSubtree: () => {},
      onFindInFolder: () => {}
    }
    const view = render(
      createElement(ContextMenu, null, createElement(FileExplorerRowContextMenu, props))
    )
    const command = { executionHostId: host, worktreeId: worktree.id, filePath: node.path }
    const fixtureWindow = new BrowserWindow()
    const runtime = new OrcaRuntimeService()
    runtime.setNotifier({
      browserViewer: (command) => requestBrowserViewerFromRenderer(fixtureWindow, command)
    })
    vi.mocked(fixtureWindow.webContents.send).mockImplementation(
      (_channel, request: BrowserViewerRequest) => {
        void applyBrowserViewerRequest(request).then(
          (result) =>
            ipcMain.emit(
              'ui:browserViewerResponse',
              { sender: fixtureWindow.webContents },
              { id: request.id, ok: true, result }
            ),
          (error: unknown) =>
            ipcMain.emit(
              'ui:browserViewerResponse',
              { sender: fixtureWindow.webContents },
              {
                id: request.id,
                ok: false,
                error: error instanceof Error ? error.message : String(error)
              }
            )
        )
      }
    )
    const cli = await createRemotePaneCliSocket(runtime)
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    const run = async (target: WorkspaceFileOpenCommand) => {
      await cli.runFile([
        '--execution-host',
        target.executionHostId,
        '--worktree',
        target.worktreeId,
        '--file',
        target.filePath
      ])
      const printed = output.mock.lastCall?.[0]
      if (typeof printed !== 'string') {
        throw new Error('Missing receipt')
      }
      return z
        .object({ result: z.object({ fileOpenState: WorkspaceFileOpenState }) })
        .parse(JSON.parse(printed)).result.fileOpenState
    }
    try {
      let receipt: WorkspaceFileOpenState | undefined
      await act(async () => {
        receipt = await run(command)
      })
      expect(receipt).toMatchObject({ mode: host === 'local' ? 'browser-tab' : 'doc-preview' })
      const page = Object.values(useAppStore.getState().browserPagesByWorkspace)
        .flat()
        .find((page) => page.id === receipt?.pageId)
      if (host === 'local') {
        expect(page?.url).toBe('file:///fixture/folder/index.html')
      } else {
        expect(page?.docLocation).toEqual({
          kind: 'workspace-doc',
          worktreeId: worktree.id,
          filePath: node.path
        })
      }
      await expect(run({ ...command, executionHostId: 'ssh:wrong' })).rejects.toThrow(
        'owner_changed'
      )
      view.rerender(
        createElement(
          ContextMenu,
          null,
          createElement(FileExplorerRowContextMenu, { ...props, canOpenInOrcaBrowser: false })
        )
      )
      await expect(run(command)).rejects.toThrow('owner_unavailable')
      cli.useLegacyPeer()
      await expect(run(command)).rejects.toThrow('does not support File')
    } finally {
      await cli.close()
      output.mockRestore()
    }
  }
)
