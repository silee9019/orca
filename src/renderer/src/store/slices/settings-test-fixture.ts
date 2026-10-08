import { vi, beforeEach, type Mock } from 'vitest'
import { makeWorktree } from './store-test-helpers'
import type { WorktreeLineage } from '../../../../shared/worktree/lineage-types'
import type { PublicKnownRuntimeEnvironment } from '../../../../shared/runtime-environments'
import {
  MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION,
  RUNTIME_PROTOCOL_VERSION
} from '../../../../shared/protocol-version'
import { clearRuntimeCompatibilityCacheForTests } from '../../runtime/runtime-rpc-client'
import { resetRuntimeCatalogListingForTests } from './runtime-status-hydration'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/agent-status', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    detectAgentStatusFromTitle: vi.fn().mockReturnValue(null)
  }
})

export const runtimeEnvironmentCall: Mock = vi.fn()
export const runtimeEnvironmentGetStatus: Mock = vi.fn()
export const settingsSet: Mock = vi.fn().mockResolvedValue(undefined)
export const settingsGet: Mock = vi.fn()
export const runtimeEnvironmentList: Mock = vi.fn()
export const setActiveRuntimeEnvironmentPreference: Mock = vi.fn().mockResolvedValue(undefined)
export const worktreesListDetected: Mock = vi.fn()

export const env2Lineage: WorktreeLineage = {
  worktreeId: 'repo-env-2::/env-2/repo',
  worktreeInstanceId: 'env-2-instance',
  parentWorktreeId: 'repo-env-2::/env-2/parent',
  parentWorktreeInstanceId: 'env-2-parent-instance',
  origin: 'manual',
  capture: { source: 'manual-action', confidence: 'explicit' },
  createdAt: 1
}

export function makeRuntimeEnvironment(id: string): PublicKnownRuntimeEnvironment {
  const endpointId = `ws-${id}`
  return {
    id,
    name: id,
    createdAt: 1,
    updatedAt: 1,
    lastUsedAt: null,
    runtimeId: null,
    endpoints: [{ id: endpointId, kind: 'websocket', label: 'WebSocket', endpoint: 'ws://x' }],
    preferredEndpointId: endpointId
  }
}

export function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  let reject: (reason?: unknown) => void = () => {}
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: tests own this optional marker and only delete it during reset.
  delete (globalThis as { __ORCA_WEB_CLIENT__?: boolean }).__ORCA_WEB_CLIENT__
  clearRuntimeCompatibilityCacheForTests()
  resetRuntimeCatalogListingForTests()
  vi.clearAllMocks()
  setActiveRuntimeEnvironmentPreference.mockReset().mockResolvedValue(undefined)
  runtimeEnvironmentGetStatus.mockResolvedValue({
    id: 'status-rpc-1',
    ok: true,
    result: {
      runtimeId: 'runtime-2',
      graphStatus: 'ready',
      runtimeProtocolVersion: RUNTIME_PROTOCOL_VERSION,
      minCompatibleRuntimeClientVersion: MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION
    },
    _meta: { runtimeId: 'runtime-2' }
  })
  settingsGet.mockResolvedValue({ notifications: {} })
  runtimeEnvironmentList.mockResolvedValue([])
  runtimeEnvironmentCall.mockImplementation(
    ({ method, params }: { method: string; params?: { repo?: string } }) => {
      const detectedRepoId = params?.repo ?? 'repo-env-2'
      const detectedPath = detectedRepoId === 'repo-env-1' ? '/env-1/repo' : '/env-2/repo'
      const result =
        method === 'status.get'
          ? {
              runtimeId: 'runtime-2',
              graphStatus: 'ready',
              runtimeProtocolVersion: RUNTIME_PROTOCOL_VERSION,
              minCompatibleRuntimeClientVersion: MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION
            }
          : method === 'repo.list'
            ? {
                repos: [
                  {
                    id: 'repo-env-2',
                    path: '/env-2/repo',
                    displayName: 'Env 2',
                    badgeColor: 'blue',
                    addedAt: 1
                  }
                ]
              }
            : method === 'worktree.list'
              ? {
                  worktrees: [
                    makeWorktree({
                      id: 'repo-env-2::/env-2/repo',
                      repoId: 'repo-env-2',
                      path: '/env-2/repo'
                    })
                  ],
                  totalCount: 1,
                  truncated: false
                }
              : method === 'worktree.detectedList'
                ? {
                    repoId: detectedRepoId,
                    authoritative: true,
                    source: 'git',
                    worktrees: [
                      {
                        ...makeWorktree({
                          id: `${detectedRepoId}::${detectedPath}`,
                          repoId: detectedRepoId,
                          path: detectedPath
                        }),
                        ownership: 'orca-managed',
                        selectedCheckout: true,
                        visible: true
                      }
                    ]
                  }
                : method === 'browser.profileList'
                  ? { profiles: [] }
                  : method === 'projectGroup.list'
                    ? { groups: [] }
                    : method === 'worktree.lineageList'
                      ? { lineage: { [env2Lineage.worktreeId]: env2Lineage } }
                      : method === 'settings.get'
                        ? { settings: {} }
                        : {}
      return Promise.resolve({ id: 'rpc-1', ok: true, result, _meta: { runtimeId: 'runtime-2' } })
    }
  )
  worktreesListDetected.mockResolvedValue({
    repoId: 'repo-env-1',
    authoritative: true,
    source: 'git',
    worktrees: [
      {
        ...makeWorktree({
          id: 'repo-env-1::/env-1/repo',
          repoId: 'repo-env-1',
          path: '/env-1/repo'
        }),
        ownership: 'orca-managed',
        selectedCheckout: true,
        visible: true
      }
    ]
  })
  vi.stubGlobal('window', {
    api: {
      settings: { get: settingsGet, set: settingsSet, setActiveRuntimeEnvironmentPreference },
      runtimeEnvironments: {
        call: runtimeEnvironmentCall,
        getStatus: runtimeEnvironmentGetStatus,
        list: runtimeEnvironmentList
      },
      worktrees: { listDetected: worktreesListDetected }
    }
  })
})
