import { useAutomationProjectChange } from './use-automation-project-change'
import { getAutomationEditorWorktrees } from './automation-editor-worktrees'
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import type {
  ExternalAutomationJob,
  ExternalAutomationManager
} from '../../../../shared/automations-types'
import { getAutomationCreateRepos } from './automation-create-projects'
import { buildAutomationEditDraft, buildExternalAutomationEditDraft } from './automation-edit-draft'
import { AUTOMATION_DEFAULT_TIME, getDefaultWorktree } from './automation-draft-model'
import type { AutomationTemplate } from './automation-templates'
import { capturedAutomationOwner, capturedAutomationOwnerKey } from './automation-captured-owner'
import { dispatchAutomationReread } from './automation-row-action-dispatch'
import { listAutomationsForTarget } from './automation-host-client'
import { repoMatchesExternalAutomationTarget } from './automation-external-target-match'
import type { ExternalAutomationScope } from './external-automation-scope-client'
import type { AutomationDraft } from './AutomationEditorDialog'
import type { AutomationListRow } from './automation-list-row-identity'
import type { AutomationsPageDestinationState } from './use-automations-page-destination-state'
import type { AutomationsPageDestinationFormState } from './use-automations-page-destination-form'
import type { AutomationsPageLocalState } from './use-automations-page-local-state'
import type { AutomationsPageStoreState } from './use-automations-page-store-state'

/** Dialog open/edit actions, including host-captured re-reads and project changes. */
export function useAutomationEditorActions({
  store,
  local,
  destination,
  destinationForm,
  visibleRows
}: {
  visibleRows: readonly AutomationListRow[]
  store: AutomationsPageStoreState
  local: AutomationsPageLocalState
  destination: AutomationsPageDestinationState
  destinationForm: AutomationsPageDestinationFormState
}) {
  const { defaultAgent, worktreesByRepo, repoMap, repos } = store
  const {
    editRequestRef,
    setEditingAutomationId,
    setEditingRowKey,
    setEditingDestination,
    setEditingHostStableKey,
    setEditingExternalTarget,
    setCreateTarget,
    setDraft,
    setDraftAtOpen,
    setCreateOpen,
    draftRef,
    editingAutomationId,
    editingHostStableKey
  } = local
  const { getDefaultTarget, automationDispatchContext, rowRecoveryHost } = destination
  const { destinationForProject } = destinationForm
  const latestContext = useRef({ automationDispatchContext, visibleRows })
  useLayoutEffect(() => {
    latestContext.current = { automationDispatchContext, visibleRows }
  })
  useEffect(
    () => () => {
      editRequestRef.current += 1
    },
    [editRequestRef]
  )

  const openCreateDialog = (template?: AutomationTemplate): void => {
    editRequestRef.current += 1
    const target = getDefaultTarget()
    setEditingAutomationId(null)
    setEditingExternalTarget(null)
    setEditingDestination(null)
    setEditingHostStableKey(null)
    setCreateTarget('orca')
    const baseDraft: AutomationDraft = {
      name: '',
      prompt: '',
      agentId: defaultAgent,
      projectId: target.projectId,
      workspaceMode: 'existing',
      workspaceId: target.workspaceId,
      baseBranch: '',
      setupDecision: undefined,
      reuseSession: false,
      precheckCommand: '',
      precheckTimeoutSeconds: '60',
      preset: 'weekdays',
      time: AUTOMATION_DEFAULT_TIME,
      dayOfWeek: '1',
      customSchedule: '',
      missedRunGraceMinutes: '720',
      savedSchedule: null,
      scheduleWarning: null
    }
    const nextDraft = template
      ? {
          ...baseDraft,
          name: template.name,
          prompt: template.prompt,
          preset: template.preset,
          time: template.time ?? baseDraft.time,
          dayOfWeek: template.dayOfWeek ?? baseDraft.dayOfWeek,
          agentId: template.agentId ?? baseDraft.agentId,
          missedRunGraceMinutes: template.missedRunGraceMinutes ?? baseDraft.missedRunGraceMinutes
        }
      : baseDraft
    setDraft(nextDraft)
    setDraftAtOpen(nextDraft)
    setCreateOpen(true)
  }

  const openEditDialog = async (row: AutomationListRow): Promise<void> => {
    const requestId = (editRequestRef.current += 1)
    setEditingExternalTarget(null)
    setCreateTarget('orca')
    const automationId = row.automation.id
    const wasVisible = visibleRows.some((current) => current.key === row.key)
    const capturedKey = capturedAutomationOwnerKey(
      capturedAutomationOwner(automationDispatchContext.capturedOwners, row.key)
    )
    const reread = await dispatchAutomationReread(
      automationDispatchContext,
      { rowKey: row.key, automationId },
      async () =>
        (await listAutomationsForTarget({ kind: 'local' })).find(
          (entry) => entry.id === automationId
        ) ?? null
    )
    if (
      requestId !== editRequestRef.current ||
      (wasVisible &&
        !latestContext.current.visibleRows.some((current) => current.key === row.key)) ||
      capturedKey !==
        capturedAutomationOwnerKey(
          capturedAutomationOwner(
            latestContext.current.automationDispatchContext.capturedOwners,
            row.key
          )
        )
    ) {
      return
    }
    if (!reread.ok && reread.notice.severity === 'owner') {
      destination.reportOwnerAction(row.key, reread.notice)
      return
    }
    const latest = (reread.ok ? reread.value : null) ?? row.automation
    setEditingAutomationId(latest.id)
    setEditingRowKey(row.key)
    const initialHostStableKey = rowRecoveryHost(row.key)?.stableKey ?? null
    const initialDestination = destinationForProject(latest.projectId, initialHostStableKey)
    setEditingDestination(
      initialDestination ? { projectId: latest.projectId, destination: initialDestination } : null
    )
    setEditingHostStableKey(initialDestination?.entry.stableKey ?? null)
    const nextDraft = buildAutomationEditDraft(latest)
    setDraft(nextDraft)
    setDraftAtOpen(nextDraft)
    setCreateOpen(true)
  }

  const openEditExternalDialog = (
    manager: ExternalAutomationManager,
    job: ExternalAutomationJob,
    scope: ExternalAutomationScope
  ): void => {
    editRequestRef.current += 1
    const targetWorktree = Object.values(worktreesByRepo)
      .flat()
      .find((worktree) => {
        const repo = repoMap.get(worktree.repoId)
        return (
          repo !== undefined &&
          getAutomationEditorWorktrees(repo, [worktree]).length > 0 &&
          repoMatchesExternalAutomationTarget(repo, manager.target) &&
          job.workdir !== null &&
          worktree.path === job.workdir
        )
      })
    const localRepos = getAutomationCreateRepos(repos, { kind: 'local' })
    const fallbackRepo = localRepos[0] ?? null
    const fallbackWorktree = fallbackRepo
      ? getDefaultWorktree(
          getAutomationEditorWorktrees(fallbackRepo, worktreesByRepo[fallbackRepo.id] ?? [])
        )
      : null
    const projectId = targetWorktree?.repoId ?? fallbackRepo?.id ?? ''
    const workspaceId = targetWorktree?.id ?? fallbackWorktree?.id ?? ''
    const nextDraft = buildExternalAutomationEditDraft(job, { projectId, workspaceId })
    setEditingAutomationId(null)
    setEditingRowKey(null)
    setEditingDestination(null)
    setEditingHostStableKey(null)
    setEditingExternalTarget({ manager, job, scope })
    setCreateTarget('hermes')
    setDraft(nextDraft)
    setDraftAtOpen(nextDraft)
    setCreateOpen(true)
  }

  const handleProjectChange = useAutomationProjectChange({
    store,
    local,
    destination,
    destinationForm
  })
  const handleDraftChange = useCallback(
    (updater: (current: AutomationDraft) => AutomationDraft): void => {
      const current = draftRef.current
      const next = updater(current)
      draftRef.current = next
      setDraft(next)
      if (
        editingAutomationId !== null &&
        (next.projectId !== current.projectId || next.workspaceId !== current.workspaceId)
      ) {
        const target = destinationForProject(next.projectId, editingHostStableKey)
        setEditingDestination(target ? { projectId: next.projectId, destination: target } : null)
        if (target) {
          setEditingHostStableKey(target.entry.stableKey)
        }
      }
    },
    [
      destinationForProject,
      draftRef,
      editingAutomationId,
      editingHostStableKey,
      setDraft,
      setEditingDestination,
      setEditingHostStableKey
    ]
  )

  return {
    openCreateDialog,
    openEditDialog,
    openEditExternalDialog,
    handleProjectChange,
    handleDraftChange
  }
}

export type AutomationEditorActions = ReturnType<typeof useAutomationEditorActions>
