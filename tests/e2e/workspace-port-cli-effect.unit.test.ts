// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import { getDefaultSettings } from '../../src/shared/constants'
import { LocalWorkspacePortsPanel } from '../../src/renderer/src/components/right-sidebar/local-workspace-ports-panel'
import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { createElement } from 'react'
import { z } from 'zod'
import {
  WorkspacePortOpenState,
  type WorkspacePortOpenCommand
} from '../../src/shared/rpc-contract/workspace-port-open-params'
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    ipcMain: new EventEmitter(),
    BrowserWindow: class extends EventEmitter {
      id = 73
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
it('uses the actual visible folder Ports panel callback and reads back the created browser page or provider acknowledgment', async () => {
  const opened: string[] = []
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      ui: { set: async () => {} },
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
        executionHostId: 'local',
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
  const worktree = useAppStore.getState().getKnownWorktreeById('folder:ports', 'local')
  if (!worktree) {
    throw new Error('Missing folder workspace')
  }
  useAppStore.setState({
    activeWorktreeId: worktree.id,
    activeRepoId: worktree.repoId,
    activeWorkspaceExecutionHostId: 'local',
    repos: [
      {
        id: worktree.repoId,
        path: worktree.path,
        displayName: 'Folder',
        badgeColor: '',
        addedAt: 0,
        executionHostId: 'local',
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
  const view = render(
    createElement(
      TooltipProvider,
      null,
      createElement(LocalWorkspacePortsPanel, { isVisible: true })
    )
  )
  expect(view.getByText(':3000')).toBeTruthy()
  const command = {
    executionHostId: 'local' as const,
    worktreeId: worktree.id,
    portId: 'port-3000',
    intent: 'saved' as const
  }
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
  const requestWorkspacePortOpen = async (
    command: WorkspacePortOpenCommand,
    _expiresAt: number
  ) => {
    await cli.runPort([
      '--execution-host',
      command.executionHostId,
      '--worktree',
      command.worktreeId,
      '--port-id',
      command.portId,
      '--intent',
      command.intent
    ])
    const printed = output.mock.lastCall?.[0]
    if (typeof printed !== 'string') {
      throw new Error('Missing receipt')
    }
    return z
      .object({ result: z.object({ portOpenState: WorkspacePortOpenState }) })
      .parse(JSON.parse(printed)).result.portOpenState
  }
  try {
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
    expect(receipt).toMatchObject({ destination: 'system' })
    expect(opened).toEqual(['http://localhost:3000'])
    await expect(
      requestWorkspacePortOpen({ ...command, executionHostId: 'ssh:wrong' }, Date.now() + 5000)
    ).rejects.toThrow('owner_unavailable')
    cli.useLegacyPeer()
    await expect(requestWorkspacePortOpen(command, Date.now() + 5000)).rejects.toThrow(
      'does not support Port'
    )
    view.unmount()
  } finally {
    await cli.close()
    output.mockRestore()
  }
})
