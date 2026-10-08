import {
  automationSaveOutcome,
  type AutomationSaveOutcome,
  type AutomationSaveProgress
} from './automation-save-outcome'
import { toast } from 'sonner'
import { isTuiAgentEnabled } from '../../../../shared/tui-agent-selection'
import {
  isValidAutomationCronSchedule,
  isValidAutomationSchedule
} from '../../../../shared/automation-schedule-parsing'
import { translate } from '@/i18n/i18n'
import { acceptsAutomationDraftSchedule } from './automation-schedule-input-gate'
import { parseDraftTime } from './automation-draft-model'
import { saveHermesAutomation } from './automation-hermes-save'
import { saveOrcaAutomation } from './automation-orca-save'
import type { AutomationSaveContext } from './automation-save-context'

/** Validates editor input then delegates the provider-specific save transaction. */
export function createAutomationSaveAction(context: AutomationSaveContext) {
  return async function saveAutomation(now = Date.now()): Promise<AutomationSaveOutcome> {
    const { store, local, destinationForm, destination } = context
    const { settings } = store
    const {
      draft,
      editingAutomationId,
      createTarget,
      editingExternalTarget,
      setIsSaving,
      setEditorNotice
    } = local
    const isHermesSave =
      editingAutomationId === null && (createTarget === 'hermes' || editingExternalTarget !== null)
    const { hour, minute } = parseDraftTime(draft.time)
    if (
      !draft.projectId ||
      ((draft.workspaceMode === 'existing' || isHermesSave) && !draft.workspaceId) ||
      !draft.prompt.trim()
    ) {
      toast.error(
        translate(
          'auto.components.automations.AutomationsPage.2430fecf53',
          'Choose a run location and enter a prompt before saving.'
        )
      )
      return { status: 'blocked', reason: 'location-or-prompt' }
    }
    if (draft.scheduleWarning) {
      toast.error(
        translate(
          'auto.components.automations.AutomationsPage.64bdb2304f',
          'Pick a supported schedule before saving.'
        )
      )
      return { status: 'blocked', reason: 'schedule-warning' }
    }
    const validateAdvancedSchedule = isHermesSave
      ? isValidAutomationCronSchedule
      : isValidAutomationSchedule
    if (
      draft.preset === 'custom' &&
      !acceptsAutomationDraftSchedule({
        customSchedule: draft.customSchedule,
        savedRrule: draft.savedSchedule,
        validate: validateAdvancedSchedule
      })
    ) {
      toast.error(
        translate(
          'auto.components.automations.AutomationsPage.6e91dab317',
          'Enter a valid advanced schedule before saving.'
        )
      )
      return { status: 'blocked', reason: 'schedule-invalid' }
    }
    if (
      editingAutomationId === null &&
      !isHermesSave &&
      !isTuiAgentEnabled(draft.agentId, settings?.disabledTuiAgents)
    ) {
      toast.error(
        translate(
          'auto.components.automations.AutomationsPage.2360ffc956',
          'Choose an enabled agent before saving.'
        )
      )
      return { status: 'blocked', reason: 'agent-disabled' }
    }
    const progress: AutomationSaveProgress = { write: null, pageRead: null, closeRequested: false }
    setIsSaving(true)
    try {
      if (!isHermesSave && editingAutomationId === null) {
        const checked = destination.createDestination.check(draft.projectId)
        if (!checked.ok) {
          setEditorNotice(checked.notice)
          return { status: 'blocked', reason: 'destination-unavailable' }
        }
      }
      const selectedWorkspaceExists =
        draft.workspaceMode !== 'existing' ||
        destinationForm.dialogWorktrees.some((worktree) => worktree.id === draft.workspaceId)
      if (!selectedWorkspaceExists) {
        toast.error(
          translate(
            'auto.components.automations.AutomationsPage.32534e7c9c',
            'Choose an available workspace before saving.'
          )
        )
        return { status: 'blocked', reason: 'workspace-unavailable' }
      }
      return await (isHermesSave
        ? saveHermesAutomation(context, progress)
        : saveOrcaAutomation(context, { hour, minute, now }, progress))
    } catch (error) {
      if (isHermesSave) {
        await context.pageRefresh.refresh().catch(() => undefined)
      }
      toast.error(
        error instanceof Error
          ? error.message
          : translate(
              'auto.components.automations.AutomationsPage.b11170a008',
              'Failed to save automation.'
            )
      )
      return automationSaveOutcome(progress)
    } finally {
      setIsSaving(false)
    }
  }
}

export type AutomationSaveAction = ReturnType<typeof createAutomationSaveAction>
