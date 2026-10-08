import {
  automationRowViewerOwner,
  type AutomationRowViewerPage
} from './automation-row-viewer-state'
import { getExternalAutomationActionDisabledMessage } from '../components/automations/external-automation-source-availability'
import type { AutomationListRow } from '../components/automations/automation-list-row-identity'

type ExternalEntry = NonNullable<
  AutomationRowViewerPage['list']['filteredExternalAutomationEntries']
>[number]
export type AutomationRowActionTarget =
  | { kind: 'local'; key: string; row: AutomationListRow }
  | { kind: 'external'; key: string; entry: ExternalEntry }
export function automationRowActionTarget(
  page: AutomationRowViewerPage,
  key: string
): AutomationRowActionTarget | undefined {
  const row = page.list.filteredRows.find((entry) => entry.key === key)
  if (row) {
    return { kind: 'local', key, row }
  }
  const entry = page.list.filteredExternalAutomationEntries?.find((entry) => entry.key === key)
  return entry ? { kind: 'external', key, entry } : undefined
}
export function automationRowActionOwner(
  page: AutomationRowViewerPage,
  target: AutomationRowActionTarget
): string {
  if (target.kind === 'local') {
    return automationRowViewerOwner(page, target.row)
  }
  const current = page.list.filteredExternalAutomationEntries?.find(
    (entry) => entry.key === target.key
  )
  return JSON.stringify([
    page.profileId,
    current?.scope,
    current?.manager.id,
    current?.manager.target
  ])
}
export function isAutomationRowActionEnabled(
  page: AutomationRowViewerPage,
  target: AutomationRowActionTarget,
  action: 'run' | 'toggle'
): boolean {
  return target.kind === 'local'
    ? page.destination.isAutomationRowActionEnabled(target.row, action)
    : Boolean(page.externalActions) &&
        getExternalAutomationActionDisabledMessage({
          manager: target.entry.manager,
          actionInProgress: Boolean(page.local.externalActionKey)
        }) === null
}
export function dispatchAutomationRowAction(
  page: AutomationRowViewerPage,
  target: AutomationRowActionTarget,
  action: 'run' | 'toggle'
) {
  if (target.kind === 'local') {
    return action === 'run'
      ? page.runActions.runNow(target.row)
      : page.managementActions.toggleAutomation(target.row)
  }
  if (!page.externalActions) {
    throw new Error('automation_row_action_unavailable')
  }
  const { scope, job } = target.entry
  return page.externalActions.runExternalAction(
    scope,
    job,
    action === 'run' ? 'run' : job.enabled ? 'pause' : 'resume'
  )
}
export function externalAutomationRowViewerRows(page: AutomationRowViewerPage) {
  return (page.list.filteredExternalAutomationEntries ?? []).map((entry) => {
    const target: AutomationRowActionTarget = { kind: 'external', key: entry.key, entry }
    return {
      rowKey: entry.key,
      scope: entry.scope,
      job: entry.job,
      owner: automationRowActionOwner(page, target),
      ownerAllowsRun: isAutomationRowActionEnabled(page, target, 'run'),
      ownerAllowsToggle: isAutomationRowActionEnabled(page, target, 'toggle')
    }
  })
}
