import {
  automationSaveOutcome,
  type AutomationSaveOutcome,
  type AutomationSaveProgress
} from './automation-save-outcome'
import { toast } from 'sonner'
import type {
  Automation,
  AutomationCreateInput,
  AutomationUpdateInput
} from '../../../../shared/automations-types'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import { buildAutomationRrule } from '../../../../shared/automation-schedule-occurrences'
import { ensureHooksConfirmed } from '@/lib/ensure-hooks-confirmed'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { listAutomationsForTarget } from './automation-host-client'
import {
  dispatchAutomationReread,
  type AutomationDispatchResult
} from './automation-row-action-dispatch'
import { buildDraftPrecheck } from './automation-draft-model'
import { buildAutomationRunContextForRepo } from './automation-run-context'
import { resolveAutomationSetupDecisionForSave } from './automation-setup-decision'
import {
  createAutomationOnDestination,
  moveAutomationToDestination,
  resolveAutomationEditDestination,
  saveExistingAutomation
} from './automation-orca-save-operations'
import type { AutomationSaveContext } from './automation-save-context'
export async function saveOrcaAutomation(
  context: AutomationSaveContext,
  time: { hour: number; minute: number; now: number },
  progress: AutomationSaveProgress
): Promise<AutomationSaveOutcome> {
  const { store, local, setup, destination, destinationForm, pageRefresh } = context
  const { repos, projectHostSetups } = store
  const {
    draft,
    createTarget,
    editingAutomationId,
    editingRowKey,
    editingDestination,
    automations,
    setAutomations,
    setDraft,
    selectAutomationId,
    setSelectedRowKey,
    setSelectedAutomationRunPageId,
    setCreateOpen,
    setEditorNotice,
    setEditorNoticeHost,
    moveCreationKeysRef
  } = local
  const {
    automationHostTarget,
    automationDispatchContext,
    invalidateRowHost,
    invalidateWrittenHost,
    rowRecoveryHost,
    createDestination
  } = destination
  const { dialogRepos, editHostResolution, automationDialogTarget } = destinationForm

  // Fence hook probes and trust prompts behind the current destination.
  const createCheck = editingAutomationId === null ? createDestination.check(draft.projectId) : null
  if (createCheck && !createCheck.ok) {
    setEditorNotice(createCheck.notice)
    return { status: 'blocked', reason: 'destination-unavailable' }
  }

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const rrule =
    draft.preset === 'custom'
      ? draft.customSchedule.trim()
      : buildAutomationRrule({
          preset: draft.preset,
          hour: time.hour,
          minute: time.minute,
          dayOfWeek: Number(draft.dayOfWeek)
        })
  const rawGrace = Number(draft.missedRunGraceMinutes)
  const missedRunGraceMinutes = Number.isFinite(rawGrace) ? Math.max(0, rawGrace) : 720
  const precheck = buildDraftPrecheck(draft)
  const reposForDraft = editingAutomationId !== null ? dialogRepos : repos
  const setupResolution =
    editingAutomationId !== null
      ? editHostResolution
      : createCheck
        ? { status: 'ready' as const, ...createCheck.destination }
        : null
  const setupHostId: ExecutionHostId | undefined =
    setupResolution?.status === 'ready' && setupResolution.authority.kind === 'runtime'
      ? (`runtime:${setupResolution.authority.environmentId}` as ExecutionHostId)
      : undefined
  const setupProjectHostSetups = setupHostId
    ? projectHostSetups.filter(
        (candidate) => candidate.repoId !== draft.projectId || candidate.hostId === setupHostId
      )
    : projectHostSetups
  let setupDecision = resolveAutomationSetupDecisionForSave({
    createTarget,
    workspaceMode: draft.workspaceMode,
    repoId: draft.projectId,
    repos: reposForDraft,
    projectHostSetups: setupProjectHostSetups,
    yamlHooks:
      draft.workspaceMode === 'new_per_run'
        ? await setup.loadAutomationYamlHooksForRepo(draft.projectId, setupHostId)
        : null,
    draftSetupDecision: draft.setupDecision
  })
  if (setupDecision === 'run') {
    const trustDecision = await ensureHooksConfirmed(
      useAppStore.getState(),
      draft.projectId,
      'setup',
      setupHostId
    )
    if (trustDecision === 'skip') {
      setupDecision = 'skip'
    }
  }

  const runContext = buildAutomationRunContextForRepo({
    repoId: draft.projectId,
    repos: reposForDraft,
    projectHostSetups: setupProjectHostSetups
  })
  if (!runContext) {
    toast.error(
      translate(
        'auto.components.automations.AutomationsPage.32534e7c9c',
        'Choose an available workspace before saving.'
      )
    )
    return { status: 'blocked', reason: 'run-context-unavailable' }
  }

  let currentAutomation = editingAutomationId
    ? (automations.find((automation) => automation.id === editingAutomationId) ?? null)
    : null
  if (editingAutomationId !== null) {
    const reread = await dispatchAutomationReread(
      automationDispatchContext,
      { rowKey: editingRowKey ?? '', automationId: editingAutomationId },
      async () =>
        (await listAutomationsForTarget(automationHostTarget ?? { kind: 'local' })).find(
          (automation) => automation.id === editingAutomationId
        ) ?? null
    )
    if (!reread.ok && reread.notice.severity === 'owner') {
      setEditorNotice(reread.notice)
      return { status: 'blocked', reason: 'owner-unavailable' }
    }
    currentAutomation = (reread.ok ? reread.value : null) ?? currentAutomation
  }

  const updates: AutomationUpdateInput = {
    name: draft.name,
    prompt: draft.prompt,
    precheck,
    agentId: draft.agentId,
    runContext,
    projectId: draft.projectId,
    workspaceMode: draft.workspaceMode,
    workspaceId: draft.workspaceId,
    baseBranch: draft.baseBranch.trim() || null,
    setupDecision,
    reuseSession: draft.workspaceMode === 'existing' && draft.reuseSession,
    timezone,
    missedRunGraceMinutes
  }
  if (!currentAutomation || currentAutomation.rrule !== rrule) {
    updates.rrule = rrule
    updates.dtstart = time.now
  }
  const createInput: AutomationCreateInput = {
    name: draft.name,
    prompt: draft.prompt,
    precheck,
    agentId: draft.agentId,
    runContext,
    projectId: draft.projectId,
    workspaceMode: draft.workspaceMode,
    workspaceId: draft.workspaceId,
    baseBranch: draft.baseBranch.trim() || null,
    setupDecision,
    reuseSession: draft.workspaceMode === 'existing' && draft.reuseSession,
    timezone,
    rrule,
    dtstart: updates.dtstart ?? time.now,
    missedRunGraceMinutes
  }

  const destinationResult = resolveAutomationEditDestination({
    currentAutomation,
    editingAutomationId,
    editingDestination,
    draft,
    rowKey: editingRowKey,
    automationDialogTarget,
    editHostEntries: destinationForm.editHostEntries,
    rowRecoveryHost
  })
  if (!destinationResult.ok) {
    setEditorNotice(destinationResult.notice)
    return { status: 'blocked', reason: 'edit-destination-unavailable' }
  }
  const { editDestination, moveTarget } = destinationResult

  let saved: AutomationDispatchResult<Automation>
  let originalRemoved = true
  if (moveTarget) {
    const moved = await moveAutomationToDestination(
      {
        automationDispatchContext,
        editingRowKey,
        automationDialogTarget,
        moveCreationKeysRef,
        invalidateWrittenHost
      },
      currentAutomation,
      moveTarget,
      {
        ...createInput,
        dtstart: updates.dtstart ?? currentAutomation?.dtstart ?? createInput.dtstart,
        enabled: currentAutomation?.enabled ?? true,
        sourceContext: currentAutomation?.sourceContext ?? null
      }
    )
    saved = moved.saved
    originalRemoved = moved.originalRemoved
  } else if (editingAutomationId !== null) {
    saved = await saveExistingAutomation(
      context,
      editingAutomationId,
      currentAutomation,
      updates,
      editDestination,
      automationHostTarget,
      editingRowKey
    )
  } else {
    saved = await createAutomationOnDestination(
      createCheck!.destination.authority,
      createInput,
      createCheck!.destination,
      invalidateWrittenHost
    )
  }
  if (!saved.ok) {
    setEditorNotice(saved.notice)
    setEditorNoticeHost(moveTarget?.entry ?? null)
    return automationSaveOutcome(progress)
  }
  const automation = saved.value
  progress.write = {
    provider: 'orca',
    operation: moveTarget ? 'move' : editingAutomationId !== null ? 'update' : 'create',
    automationId: automation.id,
    originalRemoved: moveTarget ? originalRemoved : null
  }
  if (editingAutomationId !== null) {
    invalidateRowHost(editingRowKey, 'definition')
  } else {
    await pageRefresh.hydratePersistedUIState()
  }
  setAutomations((current) => {
    const next = current.filter((entry) => entry.id !== automation.id)
    return [...next, automation].sort((left, right) => left.name.localeCompare(right.name))
  })
  setDraft((current) => ({ ...current, name: '', prompt: '' }))
  progress.pageRead = (await pageRefresh.refresh()) ? 'completed' : 'failed'
  if (editingAutomationId !== null && editingRowKey && !moveTarget) {
    setSelectedAutomationRunPageId(null)
    setSelectedRowKey(editingRowKey)
  }
  selectAutomationId(automation.id)
  setCreateOpen(false)
  progress.closeRequested = true
  if (editingAutomationId === null) {
    useAppStore.getState().recordFeatureInteraction('automation-created')
  }
  if (moveTarget && !originalRemoved) {
    return automationSaveOutcome(progress)
  }
  toast.success(
    moveTarget
      ? translate(
          'auto.components.automations.AutomationsPage.moved',
          'Automation moved to {host}.'
        ).replace('{host}', () => moveTarget.entry.authorityLabel)
      : editingAutomationId !== null
        ? translate('auto.components.automations.AutomationsPage.244727e655', 'Automation updated.')
        : translate('auto.components.automations.AutomationsPage.2a20596d6b', 'Automation saved.')
  )
  return automationSaveOutcome(progress)
}
