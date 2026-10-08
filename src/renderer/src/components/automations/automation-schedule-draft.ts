import type { AutomationDraft } from './AutomationEditorDialog'
import type { AutomationSchedulePreset } from '../../../../shared/automations-types'
import { buildAutomationCronSchedule } from '../../../../shared/automation-schedule-occurrences'
import { parseAutomationTime } from './AutomationTimeField'

function buildCustomScheduleSeed(draft: AutomationDraft): string {
  const existing = draft.customSchedule.trim()
  if (existing) {
    return draft.customSchedule
  }
  if (draft.preset === 'custom') {
    return ''
  }
  const { hour, minute } = parseAutomationTime(draft.time)
  return buildAutomationCronSchedule({
    preset: draft.preset,
    hour,
    minute,
    dayOfWeek: Number(draft.dayOfWeek)
  })
}

export function getSchedulePresetDraft(
  current: AutomationDraft,
  preset: AutomationSchedulePreset
): Pick<AutomationDraft, 'preset' | 'customSchedule' | 'scheduleWarning'> {
  return {
    preset,
    customSchedule: preset === 'custom' ? buildCustomScheduleSeed(current) : current.customSchedule,
    scheduleWarning: null
  }
}

export function setAutomationSchedulePresetDraft(
  current: AutomationDraft,
  preset: AutomationSchedulePreset
): AutomationDraft {
  return { ...current, ...getSchedulePresetDraft(current, preset) }
}
export function setAutomationScheduleWeekdayDraft(
  current: AutomationDraft,
  dayOfWeek: string
): AutomationDraft {
  return { ...current, dayOfWeek, scheduleWarning: null }
}
export function setAutomationCustomCronDraft(
  current: AutomationDraft,
  customSchedule: string
): AutomationDraft {
  return { ...current, customSchedule, scheduleWarning: null }
}
