import { readSshHostRemovalViewerState } from '@/runtime/ssh-confirmation-viewer-controller'
import { useSshConfirmationViewerController } from '@/hooks/useSshConfirmationViewerController'
import type { SshTerminateSessionsResult } from '../../../../shared/ssh-types'
import { useCallback, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { SshConnectionState } from '../../../../shared/ssh-types'
import { useMountedRef } from '@/hooks/useMountedRef'
import { SshDestructiveActionDialog } from './SshDestructiveActionDialog'
import {
  isSshTargetConnecting,
  shouldClearPendingSshReset,
  type SshTargetBusyAction
} from './ssh-target-action-state'
import { translate } from '@/i18n/i18n'

type PendingTargetAction = { id: string; label: string }

type SshTargetDestructiveActionsRenderProps = {
  busyActionForTarget: (targetId: string) => SshTargetBusyAction | undefined
  requestRemove: (target: PendingTargetAction) => void
  requestResetRelay: (target: PendingTargetAction) => void
  requestTerminateSessions: (target: PendingTargetAction) => void
}

type TargetActionResult = boolean | SshTerminateSessionsResult | void

type SshTargetDestructiveActionsProps = {
  targets?: readonly PendingTargetAction[]
  requestRemoveTarget?: (
    target: PendingTargetAction,
    plain: (target: PendingTargetAction) => void
  ) => void
  workspaceRemoveTargetId?: string | null
  connectionStates: Map<string, SshConnectionState>
  onRemove: (targetId: string) => Promise<TargetActionResult>
  onResetRelay: (targetId: string) => Promise<TargetActionResult>
  onTerminateSessions: (targetId: string) => Promise<TargetActionResult>
  children: (actions: SshTargetDestructiveActionsRenderProps) => ReactNode
}

export function SshTargetDestructiveActions({
  connectionStates,
  targets,
  requestRemoveTarget,
  workspaceRemoveTargetId,
  onRemove,
  onResetRelay,
  onTerminateSessions,
  children
}: SshTargetDestructiveActionsProps): React.JSX.Element {
  const [pendingRemove, setPendingRemove] = useState<PendingTargetAction | null>(null)
  const [pendingReset, setPendingReset] = useState<PendingTargetAction | null>(null)
  const [pendingTerminate, setPendingTerminate] = useState<PendingTargetAction | null>(null)
  const mountedRef = useMountedRef()
  // Why: confirmed SSH actions keep running after the dialog click, so this
  // state blocks overlapping relay/session teardown for the same target.
  const targetActionsInFlightRef = useRef(new Map<string, SshTargetBusyAction>())
  const [targetActionsInFlight, setTargetActionsInFlight] = useState<
    Map<string, SshTargetBusyAction>
  >(new Map())
  const connectionStatesRef = useRef(connectionStates)
  connectionStatesRef.current = connectionStates

  const beginTargetAction = useCallback(
    (targetId: string, action: SshTargetBusyAction): boolean => {
      if (targetActionsInFlightRef.current.has(targetId)) {
        return false
      }

      const nextActions = new Map(targetActionsInFlightRef.current)
      nextActions.set(targetId, action)
      targetActionsInFlightRef.current = nextActions
      setTargetActionsInFlight(nextActions)
      return true
    },
    []
  )

  const finishTargetAction = useCallback(
    (targetId: string): void => {
      const nextActions = new Map(targetActionsInFlightRef.current)
      nextActions.delete(targetId)
      targetActionsInFlightRef.current = nextActions
      if (mountedRef.current) {
        setTargetActionsInFlight(nextActions)
      }
    },
    [mountedRef]
  )

  const runConfirmedTargetAction = async (
    pendingTarget: PendingTargetAction | null,
    action: SshTargetBusyAction,
    operation: (targetId: string) => Promise<TargetActionResult>,
    clearPendingTarget: () => void
  ): Promise<TargetActionResult> => {
    if (!pendingTarget || !beginTargetAction(pendingTarget.id, action)) {
      return false
    }

    const targetId = pendingTarget.id
    try {
      const result = await operation(targetId)
      if (mountedRef.current) {
        clearPendingTarget()
      }
      return result
    } finally {
      finishTargetAction(targetId)
    }
  }

  const pendingRemoveIsBusy =
    pendingRemove !== null && targetActionsInFlight.get(pendingRemove.id) === 'remove'
  const pendingResetIsBusy =
    pendingReset !== null && targetActionsInFlight.get(pendingReset.id) === 'reset'
  const pendingResetStatus =
    pendingReset !== null
      ? (connectionStates.get(pendingReset.id)?.status ?? 'disconnected')
      : 'disconnected'
  const pendingResetBlockedByConnection =
    pendingReset !== null && isSshTargetConnecting(pendingResetStatus)
  const pendingTerminateIsBusy =
    pendingTerminate !== null && targetActionsInFlight.get(pendingTerminate.id) === 'terminate'
  const shouldClearReset = shouldClearPendingSshReset({
    pendingTargetId: pendingReset?.id ?? null,
    pendingResetIsBusy,
    connectionStatus: pendingResetStatus
  })
  if (shouldClearReset) {
    // Why: a reconnecting target cannot safely reset its relay; clear the
    // pending dialog before it paints stale destructive UI.
    setPendingReset(null)
  }
  const dialogPendingReset = shouldClearReset ? null : pendingReset

  const confirmResetRelay = async (): Promise<TargetActionResult> => {
    if (!pendingReset) {
      return false
    }

    const latestStatus = connectionStatesRef.current.get(pendingReset.id)?.status ?? 'disconnected'
    if (isSshTargetConnecting(latestStatus)) {
      setPendingReset(null)
      return false
    }

    return runConfirmedTargetAction(pendingReset, 'reset', onResetRelay, () =>
      setPendingReset(null)
    )
  }

  const actions: SshTargetDestructiveActionsRenderProps = {
    busyActionForTarget: (targetId) => targetActionsInFlight.get(targetId),
    requestRemove: (target) => {
      if (!targetActionsInFlightRef.current.has(target.id)) {
        setPendingRemove(target)
      }
    },
    requestResetRelay: (target) => {
      const status = connectionStatesRef.current.get(target.id)?.status ?? 'disconnected'
      if (!isSshTargetConnecting(status) && !targetActionsInFlightRef.current.has(target.id)) {
        setPendingReset(target)
      }
    },
    requestTerminateSessions: (target) => {
      if (!targetActionsInFlightRef.current.has(target.id)) {
        setPendingTerminate(target)
      }
    }
  }

  useSshConfirmationViewerController({
    read: () => ({
      removeTargetId: pendingRemove?.id ?? workspaceRemoveTargetId ?? null,
      workspaceRemoval: Boolean(workspaceRemoveTargetId),
      workspaceDetails: readSshHostRemovalViewerState(workspaceRemoveTargetId),
      resetTargetId: dialogPendingReset?.id ?? null,
      terminateTargetId: pendingTerminate?.id ?? null,
      busy: targetActionsInFlight.size > 0
    }),
    request: (kind, targetId) => {
      const target = targets?.find((entry) => entry.id === targetId)
      if (!target || targetActionsInFlightRef.current.has(targetId)) {
        return false
      }
      if (kind === 'reset') {
        const status = connectionStatesRef.current.get(targetId)?.status ?? 'disconnected'
        if (isSshTargetConnecting(status)) {
          return false
        }
        actions.requestResetRelay(target)
      } else if (kind === 'remove') {
        if (requestRemoveTarget) {
          requestRemoveTarget(target, actions.requestRemove)
        } else {
          actions.requestRemove(target)
        }
      } else {
        actions.requestTerminateSessions(target)
      }
      return true
    },
    confirm: (kind) =>
      kind === 'remove'
        ? runConfirmedTargetAction(pendingRemove, 'remove', onRemove, () => setPendingRemove(null))
        : kind === 'reset'
          ? confirmResetRelay()
          : runConfirmedTargetAction(pendingTerminate, 'terminate', onTerminateSessions, () =>
              setPendingTerminate(null)
            ),
    cancel: (kind) => {
      if (targetActionsInFlightRef.current.size > 0) {
        throw new Error('ssh_action_in_progress')
      }
      if (kind === 'remove') {
        setPendingRemove(null)
      } else if (kind === 'reset') {
        setPendingReset(null)
      } else {
        setPendingTerminate(null)
      }
    }
  })
  return (
    <>
      {children(actions)}

      <SshDestructiveActionDialog
        open={!!pendingRemove}
        title={translate(
          'auto.components.settings.SshTargetDestructiveActions.4808966c41',
          'Remove SSH Target'
        )}
        description={translate(
          'auto.components.settings.SshTargetDestructiveActions.3bb0cf0ee4',
          'This will remove the target and end any active remote terminals.'
        )}
        targetLabel={pendingRemove?.label}
        actionLabel="Remove"
        busyLabel="Removing"
        isBusy={pendingRemoveIsBusy}
        onOpenChange={(open) => {
          if (pendingRemoveIsBusy) {
            return
          }
          if (!open) {
            setPendingRemove(null)
          }
        }}
        onConfirm={() =>
          runConfirmedTargetAction(pendingRemove, 'remove', onRemove, () => setPendingRemove(null))
        }
      />

      <SshDestructiveActionDialog
        open={!!dialogPendingReset && (!pendingResetBlockedByConnection || pendingResetIsBusy)}
        title={translate(
          'auto.components.settings.SshTargetDestructiveActions.570a7a0574',
          'Reset Remote Relay?'
        )}
        description={translate(
          'auto.components.settings.SshTargetDestructiveActions.26be00392d',
          'This force-stops the remote relay for this SSH target. Active remote terminals and port forwards for this target will end.'
        )}
        targetLabel={dialogPendingReset?.label}
        actionLabel="Reset Relay"
        busyLabel="Resetting"
        isBusy={pendingResetIsBusy}
        onOpenChange={(open) => {
          if (pendingResetIsBusy) {
            return
          }
          if (!open) {
            setPendingReset(null)
          }
        }}
        onConfirm={confirmResetRelay}
      />

      <SshDestructiveActionDialog
        open={!!pendingTerminate}
        title={translate(
          'auto.components.settings.SshTargetDestructiveActions.accf177a03',
          'End Remote Terminals?'
        )}
        description={translate(
          'auto.components.settings.SshTargetDestructiveActions.7e66942808',
          'This will stop active terminal sessions on this SSH target. Reconnecting will not restore them.'
        )}
        targetLabel={pendingTerminate?.label}
        actionLabel="End Terminals"
        busyLabel="Ending"
        isBusy={pendingTerminateIsBusy}
        onOpenChange={(open) => {
          if (pendingTerminateIsBusy) {
            return
          }
          if (!open) {
            setPendingTerminate(null)
          }
        }}
        onConfirm={() =>
          runConfirmedTargetAction(pendingTerminate, 'terminate', onTerminateSessions, () =>
            setPendingTerminate(null)
          )
        }
      />
    </>
  )
}
