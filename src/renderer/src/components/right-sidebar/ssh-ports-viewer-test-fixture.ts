import { makeFolderWorkspace } from '@/store/slices/worktrees-slice-test-fixtures'
import { toSshExecutionHostId } from '../../../../shared/execution-host'
// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup } from '@testing-library/react'
import { beforeEach, afterEach, vi, type Mock } from 'vitest'
import { useAppStore } from '@/store'
import { applySshPortsViewerRequest } from '@/runtime/ssh-ports-viewer'
import type { ConnectionsViewerCommand } from '../../../../shared/rpc-contract/connections-viewer-params'
const owners: Record<
  'add' | 'update' | 'clipboard' | 'remove' | 'list' | 'shell' | 'browser',
  Mock
> = vi.hoisted(() => ({
  add: vi.fn(),
  update: vi.fn(),
  clipboard: vi.fn(),
  remove: vi.fn(),
  list: vi.fn(),
  shell: vi.fn(),
  browser: vi.fn()
}))
vi.mock('@/lib/workspace-browser-tab-open', () => ({ openWorkspaceBrowserTab: owners.browser }))
export const forwarded = {
  id: 'forward-a',
  connectionId: 'host-a',
  remoteHost: '127.0.0.1',
  remotePort: 8080,
  localPort: 18080,
  label: 'Service'
}
export function select(host = 'a') {
  useAppStore.setState({
    activeRepoId: `repo-${host}`,
    activeWorktreeId: `folder:folder-${host}`,
    activeWorkspaceExecutionHostId: toSshExecutionHostId(`host-${host}`)
  })
}
beforeEach(() => {
  vi.clearAllMocks()
  owners.clipboard.mockResolvedValue(undefined)
  owners.remove.mockResolvedValue(undefined)
  owners.list.mockImplementation(
    async ({ targetId }) => useAppStore.getState().portForwardsByConnection[targetId] ?? []
  )
  owners.shell.mockResolvedValue(undefined)
  owners.browser.mockResolvedValue(undefined)
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      ui: { writeClipboardText: owners.clipboard },
      ssh: {
        addPortForward: owners.add,
        updatePortForward: owners.update,
        removePortForward: owners.remove,
        listPortForwards: owners.list
      },
      shell: { openUrl: owners.shell }
    }
  })
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({
    repos: ['a', 'b'].map((host) => ({
      id: `repo-${host}`,
      path: `/fixture/${host}`,
      displayName: host,
      badgeColor: '',
      addedAt: 1,
      kind: 'folder' as const,
      connectionId: `host-${host}`
    })),
    folderWorkspaces: ['a', 'b'].map((host) =>
      makeFolderWorkspace({
        id: `folder-${host}`,
        projectGroupId: `repo-${host}`,
        connectionId: `host-${host}`,
        executionHostId: toSshExecutionHostId(`host-${host}`)
      })
    ),
    sshConnectionStates: new Map(
      ['a', 'b'].map((host) => [
        `host-${host}`,
        { targetId: `host-${host}`, status: 'connected' as const, error: null, reconnectAttempt: 0 }
      ])
    ),
    portForwardsByConnection: {
      'host-a': [forwarded],
      'host-b': [{ ...forwarded, id: 'forward-b', connectionId: 'host-b' }]
    },
    detectedPortsByConnection: {
      'host-a': [
        { host: 'localhost', port: 8080 },
        { host: 'private-host-canary', port: 443, processName: 'Private service' }
      ],
      'host-b': []
    }
  })
  select()
})
afterEach(() => {
  cleanup()
  useAppStore.setState(useAppStore.getInitialState(), true)
})
export async function invoke(command: ConnectionsViewerCommand) {
  let pending: ReturnType<typeof applySshPortsViewerRequest> | undefined
  await act(async () => {
    pending = applySshPortsViewerRequest({
      id: 'ports-fixture',
      expiresAt: Date.now() + 1000,
      command
    })
    void pending.catch(() => {})
  })
  if (!pending) {
    throw new Error('fixture_request_missing')
  }
  return pending
}

export { owners }
