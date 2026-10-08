// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import { getDefaultSettings } from '../../../../shared/constants'
import {
  getKnownExecutionHostIdForWorktree,
  getRuntimeEnvironmentIdForWorktree
} from '@/lib/worktree-runtime-owner'
import { getWorkspaceFilePreviewPlan } from '@/lib/file-preview'
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
function seed() {
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { ui: { set: async () => {} } }
  })
  const host = 'local' as const
  const connectionId = null
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
    operationOwner: { kind: 'local' }
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

  return { worktree, node, props, view, command }
}
it.each([null, 'other-repo'])(
  'preserves the original worktree-scoped file menu when activeRepoId is %s',
  (activeRepoId) => {
    const { command } = seed()
    act(() => {
      useAppStore.setState({ activeRepoId })
    })
    let receipt: ReturnType<typeof requestWorkspaceFileOpen> | undefined
    act(() => {
      receipt = requestWorkspaceFileOpen(command, Date.now() + 5000)
    })
    expect(receipt?.mode).toBe('browser-tab')
    expect(
      Object.values(useAppStore.getState().browserPagesByWorkspace)
        .flat()
        .map((page) => page.url)
    ).toEqual(['file:///fixture/folder/index.html'])
  }
)
it('preserves explicit local folder ownership while a paired runtime is active', () => {
  const { command } = seed()
  paired()
  let receipt: ReturnType<typeof requestWorkspaceFileOpen> | undefined
  act(() => {
    receipt = requestWorkspaceFileOpen(command, Date.now() + 5000)
  })
  expect(receipt?.mode).toBe('browser-tab')
})
function paired() {
  const settings = useAppStore.getState().settings
  if (!settings) {
    throw new Error('Missing settings')
  }
  act(() => {
    useAppStore.setState({
      settings: { ...settings, activeRuntimeEnvironmentId: 'fixture' },
      runtimeEnvironments: [
        {
          id: 'fixture',
          name: 'Fixture',
          createdAt: 0,
          updatedAt: 0,
          lastUsedAt: null,
          runtimeId: 'fixture-runtime',
          preferredEndpointId: 'fixture',
          endpoints: [
            { id: 'fixture', kind: 'websocket', label: 'Fixture', endpoint: 'ws://fixture.invalid' }
          ]
        }
      ]
    })
  })
}
it('routes legacy unhosted worktrees to the active paired owner and rejects a local command', () => {
  const { worktree, node, props, view } = seed()
  const legacy = { ...worktree, id: 'legacy-worktree', repoId: 'legacy-repo' }
  delete legacy.hostId
  delete legacy.runtimeOwnerEnvironmentId
  paired()
  act(() => {
    useAppStore.setState({
      folderWorkspaces: [],
      activeWorktreeId: legacy.id,
      activeRepoId: legacy.repoId,
      activeWorkspaceExecutionHostId: null,
      worktreesByRepo: { [legacy.repoId]: [legacy] },
      repos: [
        { id: legacy.repoId, path: legacy.path, displayName: 'Legacy', badgeColor: '', addedAt: 0 }
      ],
      groupsByWorktree: {
        [legacy.id]: [{ id: 'group', worktreeId: legacy.id, activeTabId: null, tabOrder: [] }]
      }
    })
  })
  view.rerender(
    <ContextMenu>
      <FileExplorerRowContextMenu
        {...props}
        node={{
          ...node,
          operationOwner: {
            kind: 'runtime',
            environmentId: 'fixture',
            executionHostId: 'runtime:fixture'
          }
        }}
      />
    </ContextMenu>
  )
  expect(() =>
    requestWorkspaceFileOpen(
      { executionHostId: 'local', worktreeId: legacy.id, filePath: node.path },
      Date.now() + 5000
    )
  ).toThrow('owner_changed')
  expect(Object.values(useAppStore.getState().browserPagesByWorkspace).flat()).toHaveLength(0)
  expect(getKnownExecutionHostIdForWorktree(useAppStore.getState(), legacy.id)).toBe(
    'runtime:fixture'
  )
  expect(getRuntimeEnvironmentIdForWorktree(useAppStore.getState(), legacy.id)).toBe('fixture')
  expect(useAppStore.getState().getKnownWorktreeById(legacy.id, 'runtime:fixture')).toBeUndefined()
  expect(getWorkspaceFilePreviewPlan(useAppStore.getState(), legacy.id, node.path).status).toBe(
    'doc-preview'
  )
  let receipt: ReturnType<typeof requestWorkspaceFileOpen> | undefined
  act(() => {
    receipt = requestWorkspaceFileOpen(
      { executionHostId: 'runtime:fixture', worktreeId: legacy.id, filePath: node.path },
      Date.now() + 5000
    )
  })
  expect(receipt?.mode).toBe('doc-preview')
  expect(
    Object.values(useAppStore.getState().browserPagesByWorkspace)
      .flat()
      .map((page) => page.docLocation)
  ).toEqual([{ kind: 'workspace-doc', worktreeId: legacy.id, filePath: node.path }])
})
it('rejects a mounted row after the selected workspace host changes before opening', () => {
  const { command } = seed()
  act(() => {
    useAppStore.setState({ activeWorkspaceExecutionHostId: 'runtime:other' })
  })
  expect(() => requestWorkspaceFileOpen(command, Date.now() + 5000)).toThrow('owner_changed')
  expect(Object.values(useAppStore.getState().browserPagesByWorkspace).flat()).toHaveLength(0)
})
