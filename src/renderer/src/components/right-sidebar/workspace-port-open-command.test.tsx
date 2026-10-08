// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import {
  MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION,
  RUNTIME_PROTOCOL_VERSION
} from '../../../../shared/protocol-version'
import { clearRuntimeCompatibilityCacheForTests } from '@/runtime/runtime-rpc-client'
import { getDefaultSettings } from '../../../../shared/constants'
import { LocalWorkspacePortsPanel } from './local-workspace-ports-panel'
import { requestWorkspacePortOpen } from '@/runtime/workspace-port-open-request'
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
it.each(['local', 'runtime:ports', 'runtime:old', 'ssh:ports'] as const)(
  'uses the actual visible folder Ports panel callback on %s and reads back the created page or provider acknowledgment',
  async (host) => {
    clearRuntimeCompatibilityCacheForTests()
    const calls: string[] = []
    const opened: string[] = []
    let labelReady: ((value: { url: string; label: string }) => void) | undefined
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        ui: { set: async () => {} },
        localhostWorktreeLabels: {
          register: () =>
            new Promise<{ url: string; label: string }>((resolve) => {
              labelReady = resolve
            })
        },
        runtimeEnvironments: {
          call: async ({ selector, method }: { selector: string; method: string }) => {
            expect(selector).toBe(host.slice(host.indexOf(':') + 1))
            calls.push(method)
            return {
              id: method,
              ok: true,
              result:
                method === 'status.get'
                  ? {
                      runtimeId: 'port-host',
                      graphStatus: 'ready',
                      runtimeProtocolVersion: RUNTIME_PROTOCOL_VERSION,
                      minCompatibleRuntimeClientVersion: MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION,
                      capabilities: host === 'runtime:old' ? [] : ['browser.screencast.v1']
                    }
                  : { browserPageId: `remote-page-${calls.length}` },
              _meta: { runtimeId: 'port-host' }
            }
          }
        },
        shell: {
          openUrl: async (url: string) => {
            opened.push(url)
          }
        }
      }
    })
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
        [host === 'local' ? 'local:all' : `environment:${host.slice(host.indexOf(':') + 1)}:all`]: {
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
    const view = render(
      <TooltipProvider>
        <LocalWorkspacePortsPanel isVisible />
      </TooltipProvider>
    )
    if (host !== 'ssh:ports') {
      expect(view.getByText(':3000')).toBeTruthy()
    }
    const command = {
      executionHostId: host,
      worktreeId: worktree.id,
      portId: 'port-3000',
      intent: 'saved' as const
    }
    if (host === 'runtime:old' || host === 'ssh:ports') {
      await act(async () => {
        await expect(requestWorkspacePortOpen(command, Date.now() + 5000)).rejects.toThrow()
      })
      expect(opened).toEqual([])
      expect(calls).not.toContain('browser.tabCreate')
      expect(Object.values(useAppStore.getState().browserPagesByWorkspace).flat()).toEqual([])
      view.unmount()
      return
    }
    let receipt: Awaited<ReturnType<typeof requestWorkspacePortOpen>> | undefined
    await act(async () => {
      receipt = await requestWorkspacePortOpen(command, Date.now() + 5000)
    })
    expect(receipt).toMatchObject({ destination: 'browser' })
    const page = Object.values(useAppStore.getState().browserPagesByWorkspace)
      .flat()
      .find((page) => page.id === receipt?.pageId)
    expect(page?.url).toBe('http://localhost:3000')
    expect(opened).toEqual([])
    await act(async () => {
      receipt = await requestWorkspacePortOpen({ ...command, intent: 'system' }, Date.now() + 5000)
    })
    expect(receipt).toMatchObject({ destination: host === 'local' ? 'system' : 'browser' })
    expect(opened).toEqual(host === 'local' ? ['http://localhost:3000'] : [])
    if (host !== 'local') {
      expect(receipt?.remotePageId).toMatch(/^remote-page-/)
      expect(calls).toContain('browser.tabCreate')
    }
    await expect(
      requestWorkspacePortOpen({ ...command, executionHostId: 'ssh:wrong' }, Date.now() + 5000)
    ).rejects.toThrow('owner_unavailable')
    await expect(requestWorkspacePortOpen(command, 0)).rejects.toThrow('owner_changed')
    if (host === 'local') {
      const current = useAppStore.getState()
      const otherFolder = {
        ...current.folderWorkspaces[0],
        id: 'ports-other',
        name: 'Other folder',
        folderPath: '/fixture/other'
      }
      const oldScan = current.workspacePortScansByKey['local:all']
      const otherPort = {
        ...oldScan.ports[0],
        id: 'port-other',
        kind: 'workspace' as const,
        owner: {
          worktreeId: 'folder:ports-other',
          repoId: worktree.repoId,
          displayName: 'Other folder',
          path: '/fixture/other',
          confidence: 'cwd' as const
        }
      }
      await act(async () => {
        useAppStore.setState({
          folderWorkspaces: [...current.folderWorkspaces, otherFolder],
          groupsByWorktree: {
            ...current.groupsByWorktree,
            'folder:ports-other': [
              {
                id: 'other-group',
                worktreeId: 'folder:ports-other',
                activeTabId: null,
                tabOrder: []
              }
            ]
          },
          workspacePortScansByKey: {
            'local:all': { ...oldScan, ports: [...oldScan.ports, otherPort] }
          }
        })
      })
      await act(async () => {
        receipt = await requestWorkspacePortOpen(
          { ...command, portId: 'port-other' },
          Date.now() + 5000
        )
      })
      expect(receipt).toMatchObject({ destination: 'browser' })
      expect(useAppStore.getState().activeWorktreeId).toBe('folder:ports-other')
      await act(async () => {
        useAppStore.getState().setActiveWorktree(worktree.id)
      })
      const countBefore = Object.values(useAppStore.getState().browserPagesByWorkspace).flat()
        .length
      await act(async () => {
        useAppStore.setState({
          settings: { ...settings, openLinksInApp: true, localhostWorktreeLabelsEnabled: true }
        })
      })
      let pending: ReturnType<typeof requestWorkspacePortOpen> | undefined
      act(() => {
        pending = requestWorkspacePortOpen(command, Date.now() + 5000)
        void pending.catch(() => {})
      })
      if (!labelReady || !pending) {
        throw new Error('Label provider was not reached')
      }
      await act(async () => {
        useAppStore.setState({
          workspacePortScansByKey: { 'local:all': { platform: 'darwin', scannedAt: 2, ports: [] } }
        })
        labelReady?.({ url: 'http://fixture.localhost:3000', label: 'fixture' })
        await expect(pending).rejects.toThrow('owner changed before opening')
      })
      expect(Object.values(useAppStore.getState().browserPagesByWorkspace).flat()).toHaveLength(
        countBefore
      )
      expect(opened).toEqual(['http://localhost:3000'])
    }
    view.unmount()
    await expect(requestWorkspacePortOpen(command, Date.now() + 5000)).rejects.toThrow(
      'owner_unavailable'
    )
  }
)
