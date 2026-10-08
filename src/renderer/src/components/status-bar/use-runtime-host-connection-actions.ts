import { useCallback, useRef, type RefObject } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '../../store'
import { translate } from '@/i18n/i18n'
import { isUserManagedRuntimeEnvironment } from '../../../../shared/runtime-environments'
import { connectRuntimeEnvironmentAndRecordStatus } from './runtime-environment-explicit-connect'
import { refreshRuntimeProjectWorktreesAndLineage } from '@/hooks/runtime-project-refresh-scheduler'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import {
  isConnectedRuntimeHostState,
  runtimeHostConnectionStateForEntry
} from '@/runtime/runtime-host-connection-state'

export async function connectRuntimeHostForNavigation(args: {
  environmentId: string
  refreshStatus: (environmentId: string, timeoutMs: number) => Promise<boolean>
  fetchRepos: (environmentId: string) => Promise<{ id: string }[]>
  fetchWorktrees: (
    repoId: string,
    options: { executionHostId: ExecutionHostId; suppressRemoteLineageRefresh: true }
  ) => Promise<unknown>
  fetchLineage: (options: { executionHostId: ExecutionHostId }) => Promise<unknown>
}): Promise<boolean> {
  if (!(await args.refreshStatus(args.environmentId, 5_000))) {
    return false
  }
  const repos = await args.fetchRepos(args.environmentId)
  await refreshRuntimeProjectWorktreesAndLineage(
    args.environmentId,
    repos,
    args.fetchWorktrees,
    args.fetchLineage
  )
  return true
}

export function useRuntimeHostConnectionActions(mountedRef: RefObject<boolean>) {
  const busyHosts = useRef(new Set<string>())
  const recordFeatureInteraction = useAppStore((s) => s.recordFeatureInteraction)
  const readRuntimeHostStatusSnapshots = useAppStore((s) => s.readRuntimeHostStatusSnapshots)
  const connectRuntimeHost = useCallback(
    async (environmentId: string): Promise<boolean> => {
      const store = useAppStore.getState()
      if (
        !mountedRef.current ||
        busyHosts.current.has(environmentId) ||
        !store.runtimeEnvironments.some(
          (environment) =>
            environment.id === environmentId && isUserManagedRuntimeEnvironment(environment)
        ) ||
        runtimeHostConnectionStateForEntry(
          store.runtimeStatusByEnvironmentId.get(environmentId)
        ) !== 'disconnected'
      ) {
        return false
      }
      busyHosts.current.add(environmentId)
      try {
        const reachable = await connectRuntimeHostForNavigation({
          environmentId,
          refreshStatus: async (id, timeout) => {
            const reachable = await connectRuntimeEnvironmentAndRecordStatus(id, timeout)
            return (
              mountedRef.current &&
              reachable &&
              useAppStore
                .getState()
                .runtimeEnvironments.find((environment) => environment.id === id) ===
                store.runtimeEnvironments.find((environment) => environment.id === id)
            )
          },
          fetchRepos: store.fetchRuntimeEnvironmentRepos,
          fetchWorktrees: store.fetchWorktrees,
          fetchLineage: store.fetchWorktreeLineage
        })
        if (!reachable) {
          toast.error(
            translate(
              'auto.components.status.bar.SshStatusSegment.runtime_connect_unavailable',
              'Remote host is not reachable'
            )
          )
          return false
        }
        recordFeatureInteraction('ssh')
        return true
      } catch {
        return false
      } finally {
        busyHosts.current.delete(environmentId)
      }
    },
    [mountedRef, recordFeatureInteraction]
  )
  const disconnectRuntimeHost = useCallback(
    async (environmentId: string): Promise<boolean> => {
      const store = useAppStore.getState()
      if (
        !mountedRef.current ||
        busyHosts.current.has(environmentId) ||
        !store.runtimeEnvironments.some(
          (environment) =>
            environment.id === environmentId && isUserManagedRuntimeEnvironment(environment)
        ) ||
        !isConnectedRuntimeHostState(
          runtimeHostConnectionStateForEntry(store.runtimeStatusByEnvironmentId.get(environmentId))
        )
      ) {
        return false
      }
      busyHosts.current.add(environmentId)
      try {
        await window.api.runtimeEnvironments.disconnect({ selector: environmentId })
        await readRuntimeHostStatusSnapshots()
        recordFeatureInteraction('ssh')
        const entry = useAppStore.getState().runtimeStatusByEnvironmentId.get(environmentId)
        return (
          runtimeHostConnectionStateForEntry(entry) === 'disconnected' &&
          ((entry?.snapshot?.environmentId === environmentId && entry.snapshot.retired === true) ||
            (entry?.remoteControl?.state === 'closed' && entry.status === null))
        )
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : translate(
                'auto.components.status.bar.SshStatusSegment.runtime_disconnect_failed',
                'Disconnect failed'
              )
        )
        return false
      } finally {
        busyHosts.current.delete(environmentId)
      }
    },
    [mountedRef, recordFeatureInteraction, readRuntimeHostStatusSnapshots]
  )

  return { connectRuntimeHost, disconnectRuntimeHost }
}
