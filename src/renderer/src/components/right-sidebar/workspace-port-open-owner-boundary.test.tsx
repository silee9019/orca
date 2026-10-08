// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import { getDefaultSettings } from '../../../../shared/constants'
import { useWorkspacePortOpenCommands } from './use-workspace-port-open-commands'
import { openWorkspacePortInBrowser } from '@/lib/workspace-port-actions'
import { requestWorkspacePortOpen } from '@/runtime/workspace-port-open-request'
import { LocalWorkspacePortsPanel } from './local-workspace-ports-panel'
import { TooltipProvider } from '@/components/ui/tooltip'
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
  const host = 'local' as const
  const settings = getDefaultSettings('/fixture/home')
  useAppStore.setState({
    settings: { ...settings, openLinksInApp: true, localhostWorktreeLabelsEnabled: false },
    persistedUIReady: true,
    folderWorkspaces: [
      {
        id: 'ports',
        projectGroupId: 'project',
        name: 'Folder',
        folderPath: '/fixture/folder',
        executionHostId: host,
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
  const worktree = useAppStore.getState().getKnownWorktreeById('folder:ports', host)
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
        kind: 'folder'
      }
    ],
    groupsByWorktree: {
      [worktree.id]: [{ id: 'group', worktreeId: worktree.id, activeTabId: null, tabOrder: [] }]
    },
    workspacePortScansByKey: {
      'local:all': {
        platform: 'darwin',
        scannedAt: 1,
        ports: [
          {
            id: 'port-3000',
            bindHost: '0.0.0.0',
            connectHost: 'localhost',
            port: 3000,
            protocol: 'http',
            kind: 'workspace',
            owner: {
              worktreeId: worktree.id,
              repoId: worktree.repoId,
              displayName: 'Folder',
              path: worktree.path,
              confidence: 'cwd'
            }
          }
        ]
      }
    }
  })
  return worktree
}
it('rejects a pending receiver whose scan key changed while the old scan remains cached', async () => {
  const worktree = seed()
  let completeLabel: ((value: { url: string; label: string }) => void) | undefined
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      ui: { set: async () => {} },
      localhostWorktreeLabels: {
        register: () =>
          new Promise<{ url: string; label: string }>((resolve) => {
            completeLabel = resolve
          })
      }
    }
  })
  function Owner({ scanKey }: { scanKey: string }) {
    useWorkspacePortOpenCommands({
      isVisible: true,
      worktreeId: worktree.id,
      repoId: worktree.repoId,
      scanKey,
      runtimeTarget: { kind: 'local' },
      scan: useAppStore.getState().workspacePortScansByKey['local:all'],
      open: async (port, _event, isCurrent) => ({
        ...(await openWorkspacePortInBrowser({
          port,
          activeWorktreeId: worktree.id,
          runtimeTarget: { kind: 'local' },
          createBrowserTab: useAppStore.getState().createBrowserTab,
          setRemoteBrowserPageHandle: useAppStore.getState().setRemoteBrowserPageHandle,
          openInOrcaBrowser: true,
          isCurrent,
          localhostLabelRoute: {
            targetUrl: 'http://localhost:3000',
            projectName: 'Fixture',
            worktreeName: 'Folder'
          }
        })),
        external: false
      })
    })
    return null
  }
  const view = render(<Owner scanKey="local:all" />)
  const pending = requestWorkspacePortOpen(
    { executionHostId: 'local', worktreeId: worktree.id, portId: 'port-3000', intent: 'saved' },
    Date.now() + 5000
  )
  void pending.catch(() => {})
  if (!completeLabel) {
    throw new Error('Label provider not reached')
  }
  view.rerender(<Owner scanKey="environment:other:all" />)
  expect(useAppStore.getState().workspacePortScansByKey['local:all'].ports).toHaveLength(1)
  await act(async () => {
    completeLabel?.({ url: 'http://fixture.localhost:3000', label: 'fixture' })
    await expect(pending).rejects.toThrow('owner changed before opening')
  })
  expect(Object.values(useAppStore.getState().browserPagesByWorkspace).flat()).toEqual([])
})
it('refuses a local command for a legacy unhosted worktree while its panel routes to the active paired host', async () => {
  const folder = seed()
  const calls: string[] = []
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      ui: { set: async () => {} },
      runtimeEnvironments: {
        call: async ({ method }: { method: string }) => {
          calls.push(method)
          throw new Error('Unexpected provider call')
        }
      },
      shell: {
        openUrl: async () => {
          calls.push('shell')
        }
      }
    }
  })
  const state = useAppStore.getState()
  const settings = state.settings
  if (!settings) {
    throw new Error('Missing settings')
  }
  const legacy = { ...folder, id: 'legacy-worktree', repoId: 'legacy-repo' }
  delete legacy.hostId
  delete legacy.runtimeOwnerEnvironmentId
  const old = state.workspacePortScansByKey['local:all']
  const port = {
    ...old.ports[0],
    kind: 'workspace' as const,
    owner: {
      worktreeId: legacy.id,
      repoId: legacy.repoId,
      displayName: 'Legacy',
      path: legacy.path,
      confidence: 'cwd' as const
    }
  }
  useAppStore.setState({
    folderWorkspaces: [],
    runtimeEnvironments: [
      {
        id: 'ports',
        name: 'Fixture host',
        createdAt: 0,
        updatedAt: 0,
        lastUsedAt: null,
        runtimeId: 'fixture-runtime',
        preferredEndpointId: 'fixture',
        endpoints: [
          { id: 'fixture', kind: 'websocket', label: 'Fixture', endpoint: 'ws://fixture.invalid' }
        ]
      }
    ],
    worktreesByRepo: { [legacy.repoId]: [legacy] },
    repos: [
      { id: legacy.repoId, path: legacy.path, displayName: 'Legacy', badgeColor: '', addedAt: 0 }
    ],
    activeWorktreeId: legacy.id,
    activeRepoId: legacy.repoId,
    activeWorkspaceExecutionHostId: null,
    settings: { ...settings, activeRuntimeEnvironmentId: 'ports' },
    workspacePortScansByKey: { 'environment:ports:all': { ...old, ports: [port] } }
  })
  render(
    <TooltipProvider>
      <LocalWorkspacePortsPanel isVisible />
    </TooltipProvider>
  )
  await expect(
    requestWorkspacePortOpen(
      { executionHostId: 'local', worktreeId: legacy.id, portId: 'port-3000', intent: 'saved' },
      Date.now() + 5000
    )
  ).rejects.toThrow('owner_unavailable')
  expect(calls).toEqual([])
  expect(Object.values(useAppStore.getState().browserPagesByWorkspace).flat()).toEqual([])
})
