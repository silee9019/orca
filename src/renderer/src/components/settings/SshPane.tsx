import { useSshTargetConnectionActions } from './use-ssh-target-connection-actions'
import { useSshPaneViewerController } from './use-ssh-pane-viewer-controller'
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { toast } from 'sonner'
import { Plus, Upload } from 'lucide-react'
import type { SshTarget, SshTerminateSessionsResult } from '../../../../shared/ssh-types'
import { useAppStore } from '@/store'
import { useMountedRef } from '@/hooks/useMountedRef'
import { Button } from '../ui/button'
import { removeSshTargetWithBestEffortCleanup } from './ssh-target-remove'
import {
  describeSshTerminateOutcome,
  terminateSshSessionsWithReconnect
} from './ssh-session-termination'
import { SshTargetCard } from './SshTargetCard'
import { SshTargetDestructiveActions } from './SshTargetDestructiveActions'
import { SshTargetForm, EMPTY_FORM, type EditingTarget } from './SshTargetForm'
import { buildSshTargetSavePayload } from './ssh-target-save-payload'
import { HostRemoveDialog } from '../sidebar/HostRemoveDialog'
import { resolveSshHostRemoval } from '../sidebar/ssh-host-remove-resolution'
import { getAllWorktreesFromState } from '@/store/selectors'
import { toSshExecutionHostId } from '../../../../shared/execution-host'
import { translate } from '@/i18n/i18n'
import { useSshAddTargetIntent } from './use-ssh-add-target-intent'
export { getSshPaneSearchEntries } from './ssh-search'

type SshPaneProps = { addTargetIntentSignal?: number }

export function SshPane({ addTargetIntentSignal }: SshPaneProps): React.JSX.Element {
  const [targets, setTargets] = useState<SshTarget[]>([])
  // Why: connection states are already hydrated and kept up-to-date by the
  // global store (via useIpcEvents.ts). Reading from the store avoids
  // duplicating the onStateChanged listener and per-target getState IPC calls.
  const sshConnectionStates = useAppStore((s) => s.sshConnectionStates)
  const recordFeatureInteraction = useAppStore((s) => s.recordFeatureInteraction)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setFormState] = useState<EditingTarget>(EMPTY_FORM)
  const formRevision = useRef(0)
  const saveInFlight = useRef(false)
  const setForm: Dispatch<SetStateAction<EditingTarget>> = useCallback((next) => {
    formRevision.current += 1
    setFormState(next)
  }, [])
  // Why: gates the submit button and the Enter path so a double click cannot
  // land two addTarget/updateTarget writes for one draft.
  const [saving, setSaving] = useState(false)
  // Why: when a target still has workspaces, route removal through the shared
  // workspace-aware HostRemoveDialog (same as the sidebar) instead of the plain
  // confirm, so the user chooses to delete or keep them rather than silently
  // orphaning them.
  const [hostRemoveTarget, setHostRemoveTarget] = useState<{
    targetId: string
    label: string
  } | null>(null)
  const mountedRef = useMountedRef()

  const setSshTargetsMetadata = useAppStore((s) => s.setSshTargetsMetadata)
  const clearRemovedSshTargetState = useAppStore((s) => s.clearRemovedSshTargetState)

  const loadTargets = useCallback(
    async (opts?: { signal?: AbortSignal }) => {
      try {
        const result = (await window.api.ssh.listTargets()) as SshTarget[]
        if (opts?.signal?.aborted || !mountedRef.current) {
          return null
        }
        setTargets(result)
        setSshTargetsMetadata(result)
        return result
      } catch {
        if (!opts?.signal?.aborted && mountedRef.current) {
          toast.error(
            translate('auto.components.settings.SshPane.f1fc50dad2', 'Failed to load SSH targets')
          )
        }
        return null
      }
    },
    [mountedRef, setSshTargetsMetadata]
  )

  useEffect(() => {
    const abortController = new AbortController()
    // Why: auto-sync ~/.ssh/config when the Manage pane opens so rotated ports
    // and newly added hosts appear without a manual Import click. Best-effort —
    // a sync failure must not block listing the already-known targets.
    void (async () => {
      try {
        const result = await window.api.ssh.importConfig()
        useAppStore.getState().recordSshRepoReadoptions(result.repoReadoptions)
      } catch {
        // Surfaced on demand via the explicit Import button; ignore here.
      }
      if (abortController.signal.aborted) {
        return
      }
      await loadTargets({ signal: abortController.signal })
    })()
    return () => abortController.abort()
  }, [loadTargets])

  const handleSave = async (): Promise<boolean> => {
    const savePayload = buildSshTargetSavePayload(form)
    if (!savePayload.ok) {
      toast.error(savePayload.error)
      return false
    }
    if (saveInFlight.current || !showForm) {
      return false
    }
    saveInFlight.current = true
    const revision = formRevision.current
    setSaving(true)

    try {
      let savedId = editingId
      if (editingId) {
        await window.api.ssh.updateTarget({ id: editingId, updates: savePayload.payload.updates })
      } else {
        const result = await window.api.ssh.addTarget({ target: savePayload.payload.target })
        savedId = result.target.id
        useAppStore.getState().recordSshRepoReadoptions(result.repoReadoptions)
      }
      const refreshed = await loadTargets()
      const saved = refreshed?.find((entry) => entry.id === savedId)
      const expected = editingId ? savePayload.payload.updates : savePayload.payload.target
      if (
        !mountedRef.current ||
        revision !== formRevision.current ||
        !saved ||
        !Object.entries(expected).every(([key, value]) => Reflect.get(saved, key) === value)
      ) {
        return false
      }
      recordFeatureInteraction('ssh')
      toast.success(
        editingId
          ? translate('auto.components.settings.SshPane.b4ba0ce33d', 'Target updated')
          : translate('auto.components.settings.SshPane.f602009125', 'Target added')
      )
      setShowForm(false)
      setEditingId(null)
      setForm(EMPTY_FORM)
      return true
    } catch (err) {
      if (mountedRef.current) {
        toast.error(
          err instanceof Error
            ? err.message
            : translate('auto.components.settings.SshPane.2227ce47b6', 'Failed to save target')
        )
      }
      return false
    } finally {
      saveInFlight.current = false
      if (mountedRef.current) {
        setSaving(false)
      }
    }
  }

  // Route removal through the workspace-aware dialog when the target still owns
  // workspaces; otherwise use the plain confirm (which also ends remote PTYs).
  const requestRemoveTarget = (
    target: { id: string; label: string },
    requestPlainRemove: (target: { id: string; label: string }) => void
  ): void => {
    const resolution = resolveSshHostRemoval({
      targetId: target.id,
      repos: useAppStore.getState().repos,
      worktrees: getAllWorktreesFromState(useAppStore.getState()),
      sshConnectionStates: useAppStore.getState().sshConnectionStates
    })
    if (resolution.workspaceCount > 0) {
      setHostRemoveTarget({ targetId: target.id, label: target.label })
      return
    }
    requestPlainRemove(target)
  }

  const verifyRemovedTarget = async (id: string): Promise<boolean> => {
    const refreshed = await loadTargets()
    return refreshed !== null && !refreshed.some((target) => target.id === id)
  }

  const handleRemove = async (id: string): Promise<boolean> => {
    try {
      await removeSshTargetWithBestEffortCleanup(window.api.ssh, id)
      // Why: a deleted passphrase-gated target may still have deferred
      // reconnect metadata; clear it so focused SSH tabs stop retrying it.
      clearRemovedSshTargetState(id)
      if (mountedRef.current) {
        toast.success(translate('auto.components.settings.SshPane.a0237eb1ca', 'Target removed'))
      }
      return verifyRemovedTarget(id)
    } catch (err) {
      if (mountedRef.current) {
        toast.error(
          err instanceof Error
            ? err.message
            : translate('auto.components.settings.SshPane.c2a69510e3', 'Failed to remove target')
        )
      }
      return false
    }
  }

  const handleTerminateSessions = async (
    targetId: string
  ): Promise<SshTerminateSessionsResult | false> => {
    try {
      const outcome = await terminateSshSessionsWithReconnect(targetId)
      const report = describeSshTerminateOutcome(outcome)
      toast[report.level](report.message)
      return outcome
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : translate(
              'auto.components.settings.SshPane.025e107643',
              'Failed to end remote terminals'
            )
      )
      return false
    }
  }

  const handleResetRelay = async (targetId: string): Promise<boolean> => {
    try {
      await window.api.ssh.resetRelay({ targetId })
      if (mountedRef.current) {
        toast.success(
          translate('auto.components.settings.SshPane.db2e48975e', 'Remote relay reset')
        )
      }
      await loadTargets()
      return true
    } catch (err) {
      if (mountedRef.current) {
        toast.error(
          err instanceof Error
            ? err.message
            : translate(
                'auto.components.settings.SshPane.2c4ee7332b',
                'Failed to reset remote relay'
              )
        )
      }
      return false
    }
  }

  const { testingIds, handleConnect, handleDisconnect, handleTest, handleImport } =
    useSshTargetConnectionActions({ targets, showForm, mountedRef, loadTargets })

  const { openAddTargetForm, handleEdit, cancelForm } = useSshPaneViewerController(
    { form, showForm, editingId, saving, targets },
    setForm,
    setEditingId,
    setShowForm,
    handleSave,
    {
      connect: handleConnect,
      disconnect: handleDisconnect,
      test: handleTest,
      import: handleImport,
      matchesImported: (expected) => expected.every((target) => targets.includes(target)),
      matchesConnection: (operation, id) => {
        const expected = operation === 'connect' ? 'connected' : 'disconnected'
        const current = useAppStore.getState().sshConnectionStates.get(id)?.status ?? 'disconnected'
        return (
          current === expected &&
          (sshConnectionStates.get(id)?.status ?? 'disconnected') === expected
        )
      }
    }
  )
  useSshAddTargetIntent(addTargetIntentSignal, openAddTargetForm)

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">
            {translate('auto.components.settings.SshPane.94c5284560', 'SSH hosts')}
          </p>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.SshPane.a7d28dff81',
              'Add an existing machine over SSH so projects and workspaces can run there.'
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="outline"
            size="xs"
            onClick={() => void handleImport()}
            className="gap-1.5"
          >
            <Upload className="size-3" />
            {translate('auto.components.settings.SshPane.51d7dba44d', 'Import')}
          </Button>
          <Button variant="outline" size="xs" onClick={openAddTargetForm} className="gap-1.5">
            <Plus className="size-3" />
            {translate('auto.components.settings.SshPane.639ceb3698', 'Add Target')}
          </Button>
        </div>
      </div>

      <SshTargetDestructiveActions
        targets={targets}
        requestRemoveTarget={requestRemoveTarget}
        workspaceRemoveTargetId={hostRemoveTarget?.targetId ?? null}
        connectionStates={sshConnectionStates}
        onRemove={handleRemove}
        onResetRelay={handleResetRelay}
        onTerminateSessions={handleTerminateSessions}
      >
        {({ busyActionForTarget, requestRemove, requestResetRelay, requestTerminateSessions }) => (
          <>
            {/* Target list */}
            {targets.length === 0 ? (
              <div className="flex items-center justify-center rounded-lg border border-dashed border-border/60 bg-card/30 px-4 py-5 text-sm text-muted-foreground">
                {translate(
                  'auto.components.settings.SshPane.c0f1c80166',
                  'No SSH targets configured.'
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {targets.map((target) => (
                  <SshTargetCard
                    key={target.id}
                    target={target}
                    state={sshConnectionStates.get(target.id)}
                    testing={testingIds.has(target.id)}
                    busyAction={busyActionForTarget(target.id)}
                    onConnect={handleConnect}
                    onDisconnect={handleDisconnect}
                    onTerminateSessions={(id) =>
                      requestTerminateSessions({ id, label: target.label })
                    }
                    onResetRelay={(id) => requestResetRelay({ id, label: target.label })}
                    onTest={handleTest}
                    onEdit={handleEdit}
                    onRemove={(id) =>
                      requestRemoveTarget({ id, label: target.label }, requestRemove)
                    }
                  />
                ))}
              </div>
            )}
          </>
        )}
      </SshTargetDestructiveActions>

      {/* Why: modal keeps the form in viewport over long host lists (STA-3067). */}
      <SshTargetForm
        open={showForm}
        editingId={editingId}
        form={form}
        saving={saving}
        onFormChange={setForm}
        onSave={() => void handleSave()}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            cancelForm()
          }
        }}
      />

      {hostRemoveTarget ? (
        <HostRemoveDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setHostRemoveTarget(null)
              void loadTargets()
            }
          }}
          hostId={toSshExecutionHostId(hostRemoveTarget.targetId)}
          label={hostRemoveTarget.label}
          target={{ kind: 'ssh', targetId: hostRemoveTarget.targetId }}
          verifyRemovedTarget={verifyRemovedTarget}
        />
      ) : null}
    </div>
  )
}
