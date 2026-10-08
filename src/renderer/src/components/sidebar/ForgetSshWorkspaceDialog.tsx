import { useSshWorkspaceRemovalViewerController } from '@/hooks/useSshConfirmationViewerController'
import { folderWorkspaceKey } from '../../../../shared/workspace-scope'
import { findFolderWorkspaceOwner } from '@/lib/folder-workspace-runtime-owner'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Server, ServerOff } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useMountedRef } from '@/hooks/useMountedRef'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { runWorktreeDeleteWithToast } from './delete-worktree-flow'
import { connectRuntimeEnvironmentSshTarget } from '@/runtime/runtime-environment-ssh-state'
import { selectRuntimeAwareSshTargetLabel } from '@/store/slices/runtime-environment-ssh-selectors'
import {
  parseExecutionHostId,
  type ExecutionHostId,
  toSshExecutionHostId
} from '../../../../shared/execution-host'
import type { WorktreeRemovalTarget } from '../../../../shared/worktree/removal'
import type { SshWorkspaceForgetResolution } from './ssh-workspace-forget-resolution'

type ForgetSshWorkspaceModalData = {
  worktreeId: string
  displayName: string
  resolution: SshWorkspaceForgetResolution
  expectedHostId?: ExecutionHostId
  folderWorkspaceId?: string
}

function isForgetModalData(data: unknown): data is ForgetSshWorkspaceModalData {
  if (!data || typeof data !== 'object') {
    return false
  }
  const candidate = data as Partial<ForgetSshWorkspaceModalData>
  return (
    typeof candidate.worktreeId === 'string' &&
    candidate.resolution != null &&
    (candidate.folderWorkspaceId === undefined ||
      (typeof candidate.folderWorkspaceId === 'string' &&
        candidate.worktreeId === folderWorkspaceKey(candidate.folderWorkspaceId))) &&
    (candidate.expectedHostId === undefined ||
      parseExecutionHostId(candidate.expectedHostId) !== null)
  )
}

export function ForgetSshWorkspaceDialog(): React.JSX.Element | null {
  const modalData = useAppStore((s) => s.modalData)
  const storeCloseModal = useAppStore((s) => s.closeModal)
  const hostLabel = useAppStore((s) => {
    const resolution = isForgetModalData(s.modalData) ? s.modalData.resolution : null
    const targetId = resolution && resolution.kind !== 'not-ssh' ? resolution.targetId : undefined
    if (!targetId) {
      return ''
    }
    // Prefer the live label, then the removed target's last known label (ghost
    // host), then the raw id as a last resort.
    const data = isForgetModalData(s.modalData) ? s.modalData : null
    const host = parseExecutionHostId(data?.expectedHostId)
    return selectRuntimeAwareSshTargetLabel(
      s,
      host?.kind === 'runtime' ? host.environmentId : null,
      targetId
    )
  })
  const [busy, setBusy] = useState<null | 'reconnect' | 'forget'>(null)
  const mountedRef = useMountedRef()
  const busyRef = useRef<ForgetSshWorkspaceModalData | null>(null)
  function closeModal(allowBusy = false): boolean {
    if (
      !mountedRef.current ||
      useAppStore.getState().modalData !== modalData ||
      (!allowBusy && busyRef.current !== null)
    ) {
      return false
    }
    storeCloseModal()
    return useAppStore.getState().modalData !== modalData
  }
  useSshWorkspaceRemovalViewerController({
    read: () => {
      const current = useAppStore.getState().modalData
      const data = isForgetModalData(current) ? current : null
      return {
        workspaceId: data?.worktreeId ?? null,
        confirmationKind: data?.folderWorkspaceId ? 'folder' : 'workspace',
        expectedHostId:
          data?.expectedHostId ??
          (data && data.resolution.kind !== 'not-ssh'
            ? toSshExecutionHostId(data.resolution.targetId)
            : null),
        targetId: data && data.resolution.kind !== 'not-ssh' ? data.resolution.targetId : null,
        dialogOpen: data !== null,
        canReconnect: data?.resolution.kind === 'disconnected',
        busy: busyRef.current !== null
      }
    },
    forget: handleForget,
    reconnectDelete: handleReconnectAndDelete,
    cancel: () => closeModal()
  })

  if (!isForgetModalData(modalData)) {
    return null
  }
  const { worktreeId, displayName, resolution } = modalData
  const canReconnect = resolution.kind === 'disconnected'
  // This dialog only opens for a workspace pinned to a named SSH target, so that
  // target IS the host the removal was confirmed against (STA-4343).
  const removalTarget: WorktreeRemovalTarget = {
    id: worktreeId,
    executionHostId:
      modalData.expectedHostId ??
      (resolution.kind === 'not-ssh' ? null : toSshExecutionHostId(resolution.targetId))
  }

  async function handleReconnectAndDelete(): Promise<boolean> {
    if (
      !isForgetModalData(modalData) ||
      resolution.kind !== 'disconnected' ||
      busyRef.current ||
      useAppStore.getState().modalData !== modalData
    ) {
      return false
    }
    busyRef.current = modalData
    setBusy('reconnect')
    try {
      const host = parseExecutionHostId(removalTarget.executionHostId)
      if (host?.kind === 'runtime') {
        const connected = await connectRuntimeEnvironmentSshTarget(
          host.environmentId,
          resolution.targetId
        )
        if (connected?.targetId !== resolution.targetId || connected.status !== 'connected') {
          return false
        }
      } else {
        await window.api.ssh.connect({ targetId: resolution.targetId })
      }
      if (useAppStore.getState().modalData !== modalData || !closeModal(true)) {
        return false
      }
      const deleted = await runWorktreeDeleteWithToast(removalTarget, displayName)
      return deleted && !isForgetModalData(useAppStore.getState().modalData)
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : translate(
              'auto.components.sidebar.ForgetSshWorkspaceDialog.reconnectFailed',
              'Reconnection failed'
            )
      )
      return false
    } finally {
      busyRef.current = null
      if (mountedRef.current) {
        setBusy(null)
      }
    }
  }

  async function handleForget(): Promise<boolean> {
    if (
      !isForgetModalData(modalData) ||
      busyRef.current ||
      useAppStore.getState().modalData !== modalData
    ) {
      return false
    }
    busyRef.current = modalData
    setBusy('forget')
    try {
      if (modalData.folderWorkspaceId) {
        const host = modalData.expectedHostId
        const state = useAppStore.getState()
        if (!host || !findFolderWorkspaceOwner(state, modalData.folderWorkspaceId, host)) {
          return false
        }
        const deleted = await state.deleteFolderWorkspace(modalData.folderWorkspaceId, {
          executionHostId: host
        })
        return (
          deleted &&
          !findFolderWorkspaceOwner(useAppStore.getState(), modalData.folderWorkspaceId, host) &&
          closeModal(true)
        )
      }
      const result = await useAppStore
        .getState()
        .removeWorktree(removalTarget, false, { mode: 'forget-local' })
      if (!result.ok) {
        toast.error(result.error)
        return false
      }
      return closeModal(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
      return false
    } finally {
      busyRef.current = null
      if (mountedRef.current) {
        setBusy(null)
      }
    }
  }

  const forgetDescription = translate(
    'auto.components.sidebar.ForgetSshWorkspaceDialog.forgetBody',
    'Removes this workspace from Orca only. Files, the Git worktree, and branches on {{host}} are left untouched.',
    { host: hostLabel }
  )

  return (
    <Dialog open onOpenChange={(open) => (!open ? closeModal() : undefined)}>
      <DialogContent className="sm:max-w-md gap-3 p-5" showCloseButton={false}>
        <DialogHeader className="gap-1">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <ServerOff className="size-4 text-muted-foreground" />
            {translate(
              'auto.components.sidebar.ForgetSshWorkspaceDialog.title',
              'Delete “{{name}}”?',
              {
                name: displayName
              }
            )}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {canReconnect
              ? translate(
                  'auto.components.sidebar.ForgetSshWorkspaceDialog.disconnectedBody',
                  'The SSH host for this workspace is not connected. Reconnect to delete it on the remote too, or remove it from Orca only.'
                )
              : translate(
                  'auto.components.sidebar.ForgetSshWorkspaceDialog.ghostBody',
                  '{{host}} is no longer a saved SSH host, so this workspace is no longer connected to a live host. It can only be removed from Orca — files and branches on the remote are left untouched.',
                  { host: hostLabel }
                )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2.5 rounded-md border border-border/50 bg-card/40 px-3 py-2">
          <Server className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-xs font-medium">{hostLabel}</span>
        </div>

        {/* Why: the ghost-host description already states files are untouched, so
            only repeat the reassurance on the reconnect (disconnected) path. */}
        {canReconnect ? (
          <p className="text-[11px] leading-snug text-muted-foreground">{forgetDescription}</p>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" size="sm" onClick={() => closeModal()} disabled={busy != null}>
            {translate('auto.components.sidebar.ForgetSshWorkspaceDialog.cancel', 'Cancel')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleForget()}
            disabled={busy != null}
          >
            {busy === 'forget' ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {translate(
              'auto.components.sidebar.ForgetSshWorkspaceDialog.forget',
              'Remove from Orca'
            )}
          </Button>
          {canReconnect ? (
            <Button
              size="sm"
              onClick={() => void handleReconnectAndDelete()}
              disabled={busy != null}
            >
              {busy === 'reconnect' ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {translate(
                'auto.components.sidebar.ForgetSshWorkspaceDialog.reconnectAndDelete',
                'Reconnect & Delete'
              )}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ForgetSshWorkspaceDialog
