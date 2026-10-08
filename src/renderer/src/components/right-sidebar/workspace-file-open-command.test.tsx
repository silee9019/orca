// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import { getDefaultSettings } from '../../../../shared/constants'
import { ContextMenu } from '@/components/ui/context-menu'
import { FileExplorerRowContextMenu } from './file-explorer-row-context-menu'
import { requestWorkspaceFileOpen } from '@/runtime/workspace-file-open-request'
import type { TreeNode } from './file-explorer-types'
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
      <ContextMenu>
        <FileExplorerRowContextMenu {...props} />
      </ContextMenu>
    )
    const command = { executionHostId: host, worktreeId: worktree.id, filePath: node.path }
    let receipt: ReturnType<typeof requestWorkspaceFileOpen> | undefined
    act(() => {
      receipt = requestWorkspaceFileOpen(command, Date.now() + 5000)
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
    if (host !== 'local') {
      let repeated: ReturnType<typeof requestWorkspaceFileOpen> | undefined
      act(() => {
        repeated = requestWorkspaceFileOpen(command, Date.now() + 5000)
      })
      expect(repeated?.pageId).toBe(receipt?.pageId)
    }
    const countBefore = Object.values(useAppStore.getState().browserPagesByWorkspace).flat().length
    act(() => {
      useAppStore.getState().openModal('add-repo')
    })
    expect(() => requestWorkspaceFileOpen(command, Date.now() + 5000)).toThrow('viewer_busy')
    act(() => {
      useAppStore.getState().closeModal()
    })
    view.rerender(
      <>
        <ContextMenu>
          <FileExplorerRowContextMenu {...props} />
        </ContextMenu>
        <ContextMenu>
          <FileExplorerRowContextMenu {...props} />
        </ContextMenu>
      </>
    )
    expect(() => requestWorkspaceFileOpen(command, Date.now() + 5000)).toThrow('owner_ambiguous')
    expect(Object.values(useAppStore.getState().browserPagesByWorkspace).flat()).toHaveLength(
      countBefore
    )
    view.rerender(
      <ContextMenu>
        <FileExplorerRowContextMenu
          {...props}
          node={{ ...node, operationOwner: { kind: 'unresolved' } }}
        />
      </ContextMenu>
    )
    expect(() => requestWorkspaceFileOpen(command, Date.now() + 5000)).toThrow('owner_changed')
    expect(Object.values(useAppStore.getState().browserPagesByWorkspace).flat()).toHaveLength(
      countBefore
    )
    view.rerender(
      <ContextMenu>
        <FileExplorerRowContextMenu {...props} />
      </ContextMenu>
    )
    expect(() =>
      requestWorkspaceFileOpen({ ...command, executionHostId: 'ssh:wrong' }, Date.now() + 5000)
    ).toThrow('owner_changed')
    expect(() => requestWorkspaceFileOpen(command, 0)).toThrow('owner_changed')
    view.rerender(
      <ContextMenu>
        <FileExplorerRowContextMenu {...props} canOpenInOrcaBrowser={false} />
      </ContextMenu>
    )
    expect(() => requestWorkspaceFileOpen(command, Date.now() + 5000)).toThrow('owner_unavailable')
    view.unmount()
    expect(() => requestWorkspaceFileOpen(command, Date.now() + 5000)).toThrow('owner_unavailable')
  }
)
