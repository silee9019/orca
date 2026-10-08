import { useRuntimeHostConnectionActions } from './use-runtime-host-connection-actions'
export { connectRuntimeHostForNavigation } from './use-runtime-host-connection-actions'
import { useStatusBarConnectionsViewerController } from '@/hooks/useStatusBarConnectionsViewerController'
import { useMountedRef } from '@/hooks/useMountedRef'
import React, { useMemo, useState } from 'react'
import { AlertTriangle, Loader2, MonitorSmartphone, Server, ServerOff } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useAppStore } from '../../store'
import type { SshConnectionStatus } from '../../../../shared/ssh-types'
import { translate } from '@/i18n/i18n'
import { getHostDisplayLabelOverrides } from '../../../../shared/host-setting-overrides'
import {
  isRuntimeOwnedSshTargetId,
  toRuntimeExecutionHostId
} from '../../../../shared/execution-host'
import { isUserManagedRuntimeEnvironment } from '../../../../shared/runtime-environments'
import { RuntimeHostStatusRow } from './RuntimeHostStatusRow'
import {
  connectedHostCountLabel,
  connectingHostsLabel,
  workspaceSyncProblemLabel
} from './ssh-status-segment-copy'
import { SshTargetStatusRow } from './SshTargetStatusRow'
import {
  overallDotColor,
  overallStatus,
  runtimeHostConnectionDetail,
  sshStatusForOverall
} from './remote-host-connection-status'
import {
  isConnectedRuntimeHostState,
  runtimeHostConnectionStateForEntry,
  runtimeStatusForOverall
} from '@/runtime/runtime-host-connection-state'

export function SshStatusSegment({
  compact,
  iconOnly
}: {
  compact: boolean
  iconOnly: boolean
}): React.JSX.Element | null {
  const mountedRef = useMountedRef()
  const [open, setOpen] = useState(false)
  const sshConnectionStates = useAppStore((s) => s.sshConnectionStates)
  const sshTargetLabels = useAppStore((s) => s.sshTargetLabels)
  const settings = useAppStore((s) => s.settings)
  const runtimeEnvironments = useAppStore((s) => s.runtimeEnvironments)
  const runtimeStatusByEnvironmentId = useAppStore((s) => s.runtimeStatusByEnvironmentId)
  const hydrateRuntimeEnvironmentStatuses = useAppStore((s) => s.hydrateRuntimeEnvironmentStatuses)
  const remoteWorkspaceSyncStatusByTargetId = useAppStore(
    (s) => s.remoteWorkspaceSyncStatusByTargetId
  )
  const setActiveView = useAppStore((s) => s.setActiveView)
  const openSettingsTarget = useAppStore((s) => s.openSettingsTarget)
  const recordFeatureInteraction = useAppStore((s) => s.recordFeatureInteraction)

  const hostLabelOverrides = useMemo(() => getHostDisplayLabelOverrides(settings), [settings])
  const targets = Array.from(sshTargetLabels.entries())
    // Why: runtime-owned (per-workspace-env) SSH targets are hidden — never list them
    // as a user-facing SSH host in the status bar.
    .filter(([id]) => !isRuntimeOwnedSshTargetId(id))
    .map(([id, label]) => {
      const state = sshConnectionStates.get(id)
      return {
        id,
        label,
        status: (state?.status ?? 'disconnected') as SshConnectionStatus,
        syncStatus: remoteWorkspaceSyncStatusByTargetId[id]
      }
    })
  const runtimeHosts = runtimeEnvironments
    .filter(isUserManagedRuntimeEnvironment)
    .map((environment) => {
      const statusEntry = runtimeStatusByEnvironmentId.get(environment.id)
      const override = hostLabelOverrides.get(toRuntimeExecutionHostId(environment.id))
      return {
        id: environment.id,
        label: override || environment.name || environment.id,
        snapshot: statusEntry?.snapshot,
        status: statusEntry?.status ?? null,
        active: settings?.activeRuntimeEnvironmentId === environment.id,
        remoteControl: statusEntry?.remoteControl ?? statusEntry?.status?.remoteControl ?? null
      }
    })
  const runtimeHostRows = runtimeHosts.map((host) => ({
    ...host,
    state: runtimeHostConnectionStateForEntry(runtimeStatusByEnvironmentId.get(host.id))
  }))
  // Available remote servers are online even when they are not the active runtime.
  // Keep host health separate from the advanced active-server selection.
  const connectedRuntimeHosts = runtimeHostRows.filter((host) =>
    isConnectedRuntimeHostState(host.state)
  )
  const inactiveRuntimeHosts = runtimeHostRows.filter(
    (host) => !isConnectedRuntimeHostState(host.state)
  )
  const connectedTargets = targets.filter((target) => target.status === 'connected')
  const disconnectedTargets = targets.filter((target) => target.status !== 'connected')
  const { connectRuntimeHost, disconnectRuntimeHost } = useRuntimeHostConnectionActions(mountedRef)

  const hasCurrentHosts = (): boolean => {
    const state = useAppStore.getState()
    return (
      Array.from(state.sshTargetLabels.keys()).some((id) => !isRuntimeOwnedSshTargetId(id)) ||
      state.runtimeEnvironments.some(isUserManagedRuntimeEnvironment)
    )
  }
  const changeDisclosure = async (value: boolean): Promise<boolean> => {
    if (!mountedRef.current || !hasCurrentHosts()) {
      return false
    }
    setOpen(value)
    if (value) {
      await hydrateRuntimeEnvironmentStatuses()
      recordFeatureInteraction('ssh')
    }
    return mountedRef.current
  }
  const manageHosts = (): boolean => {
    if (!mountedRef.current || !hasCurrentHosts()) {
      return false
    }
    recordFeatureInteraction('ssh')
    openSettingsTarget({ pane: 'servers', repoId: null })
    setActiveView('settings')
    return true
  }
  useStatusBarConnectionsViewerController(
    {
      surface: 'hosts',
      read: (environmentId) => {
        const state = useAppStore.getState()
        const exists =
          environmentId &&
          state.runtimeEnvironments.some(
            (environment) =>
              environment.id === environmentId && isUserManagedRuntimeEnvironment(environment)
          )
        const runtimeState = exists
          ? runtimeHostConnectionStateForEntry(
              state.runtimeStatusByEnvironmentId.get(environmentId)
            )
          : undefined
        return {
          open,
          settingsOpen:
            state.activeView === 'settings' && state.settingsNavigationTarget?.pane === 'servers',
          ...(exists
            ? { environmentId, runtimeState, connected: runtimeState === 'connected' }
            : {})
        }
      },
      disclosure: changeDisclosure,
      manage: manageHosts,
      connect: connectRuntimeHost,
      disconnect: disconnectRuntimeHost
    },
    targets.length > 0 || runtimeHosts.length > 0
  )

  if (targets.length === 0 && runtimeHosts.length === 0) {
    return null
  }

  const statuses = [
    ...targets.map((t) => sshStatusForOverall(t.status)),
    ...runtimeHostRows.map((host) => runtimeStatusForOverall(host.state))
  ]
  const overall = overallStatus(statuses)
  const connectedHostCount = statuses.filter((status) => status === 'connected').length
  const anyConnecting = overall === 'connecting'
  const syncProblem = targets.find(
    (t) => t.syncStatus?.phase === 'conflict' || t.syncStatus?.phase === 'error'
  )
  const syncProblemLabel = syncProblem
    ? workspaceSyncProblemLabel(syncProblem.syncStatus?.phase)
    : null
  return (
    <DropdownMenu
      open={open}
      onOpenChange={(value) => {
        void changeDisclosure(value)
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 cursor-pointer rounded px-1 py-0.5 hover:bg-accent/70"
          aria-label={translate(
            'auto.components.status.bar.SshStatusSegment.fdc57e9970',
            'Remote host connection status'
          )}
        >
          {iconOnly ? (
            <span className="inline-flex items-center gap-1">
              <span
                className={`inline-block size-2 rounded-full ${
                  syncProblem ? 'bg-destructive' : overallDotColor(overall, connectedHostCount)
                }`}
              />
              {syncProblem ? (
                <AlertTriangle className="size-3 text-destructive" />
              ) : anyConnecting ? (
                <Loader2 className="size-3 animate-spin text-muted-foreground" />
              ) : (
                <MonitorSmartphone className="size-3 text-muted-foreground" />
              )}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              {syncProblem ? (
                <AlertTriangle className="size-3 text-destructive" />
              ) : anyConnecting ? (
                <Loader2 className="size-3 animate-spin text-yellow-500" />
              ) : overall === 'connected' ? (
                <Server className="size-3 text-emerald-500" />
              ) : overall === 'partial' ? (
                <Server className="size-3 text-muted-foreground" />
              ) : (
                <ServerOff className="size-3 text-muted-foreground" />
              )}
              {!compact && (
                <span className="text-[11px]">
                  <span className={syncProblem ? 'text-destructive' : 'text-muted-foreground'}>
                    {syncProblemLabel ??
                      (anyConnecting
                        ? connectingHostsLabel()
                        : connectedHostCountLabel(connectedHostCount))}
                  </span>
                </span>
              )}
              <span
                className={`inline-block size-1.5 rounded-full ${
                  syncProblem ? 'bg-destructive' : overallDotColor(overall, connectedHostCount)
                }`}
              />
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-[min(20rem,calc(100vw-1rem))]"
      >
        <div className="px-2 pt-1.5 pb-1 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {translate('auto.components.status.bar.SshStatusSegment.6e8a9a4242', 'Remote Hosts')}
        </div>
        {connectedRuntimeHosts.map((host) => (
          <RuntimeHostStatusRow
            key={host.id}
            label={host.label}
            state={host.state}
            detail={runtimeHostConnectionDetail(host.remoteControl)}
            diagnostics={host.remoteControl}
            onConnect={async () => {
              await connectRuntimeHost(host.id)
            }}
            onDisconnect={async () => {
              await disconnectRuntimeHost(host.id)
            }}
          />
        ))}
        {connectedTargets.map((t) => (
          <SshTargetStatusRow
            key={t.id}
            targetId={t.id}
            label={t.label}
            status={t.status}
            syncStatus={t.syncStatus}
          />
        ))}
        {inactiveRuntimeHosts.map((host) => (
          <RuntimeHostStatusRow
            key={host.id}
            label={host.label}
            state={host.state}
            detail={runtimeHostConnectionDetail(host.remoteControl)}
            diagnostics={host.remoteControl}
            onConnect={async () => {
              await connectRuntimeHost(host.id)
            }}
            onDisconnect={async () => {
              await disconnectRuntimeHost(host.id)
            }}
          />
        ))}
        {disconnectedTargets.map((t) => (
          <SshTargetStatusRow
            key={t.id}
            targetId={t.id}
            label={t.label}
            status={t.status}
            syncStatus={t.syncStatus}
          />
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={manageHosts}>
          {translate(
            'auto.components.status.bar.SshStatusSegment.3ad70e0365',
            'Manage Remote Hosts…'
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
