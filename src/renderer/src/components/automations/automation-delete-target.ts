import type { AutomationAuthorityRef } from '../../../../shared/automation-owner-ref'
import { capturedAutomationOwner } from './automation-captured-owner'
import type { AutomationHostTarget } from './automation-host-client'
import type { AutomationListRow } from './automation-list-row-identity'
import type { AutomationDispatchContext } from './automation-row-action-dispatch'

export type AutomationDeleteTarget = AutomationListRow & {
  deletionCapture: {
    context: AutomationDispatchContext
    legacyTarget: AutomationHostTarget | null
  }
}

export function captureAutomationDeleteTarget(
  row: AutomationListRow,
  context: AutomationDispatchContext,
  authority: AutomationAuthorityRef,
  legacyTarget: AutomationHostTarget | null
): AutomationDeleteTarget {
  return {
    ...row,
    deletionCapture: {
      context: {
        authority: structuredClone(authority),
        capturedOwners: new Map([
          [row.key, structuredClone(capturedAutomationOwner(context.capturedOwners, row.key))]
        ])
      },
      legacyTarget: structuredClone(legacyTarget)
    }
  }
}
