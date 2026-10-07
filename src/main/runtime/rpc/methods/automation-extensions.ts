import { defineMethod } from '../core'
import type { ScopedExternalAutomations } from '../../../automations/external-manager'
import type { AutomationService } from '../../../automations/service'
import type { Store } from '../../../persistence'
import {
  ExternalAutomationListParams,
  ExternalAutomationRunsParams,
  ExternalAutomationCreateParams,
  ExternalAutomationUpdateParams,
  ExternalAutomationActionParams,
  AutomationRunPrecheckParams,
  AutomationSnapshotNameParams
} from '../../../../shared/rpc-contract/automation-extensions-params'

type AutomationExtensionServices = {
  external: ScopedExternalAutomations
  precheck: AutomationService['runPrecheck']
  snapshotName: Store['snapshotAutomationRunWorkspaceDisplayName']
}
let services: AutomationExtensionServices | null = null
export function setAutomationExtensionsForRpc(value: AutomationExtensionServices | null): void {
  services = value
}
function requireServices(): AutomationExtensionServices {
  if (!services) {
    throw new Error('Automation extension services are not available on this runtime')
  }
  return services
}
export const AUTOMATION_EXTENSION_METHODS = [
  defineMethod({
    name: 'automation.externalList',
    params: ExternalAutomationListParams,
    handler: (params) => requireServices().external.listManager(params)
  }),
  defineMethod({
    name: 'automation.externalRuns',
    params: ExternalAutomationRunsParams,
    handler: (params) => requireServices().external.listRuns(params)
  }),
  defineMethod({
    name: 'automation.externalCreate',
    params: ExternalAutomationCreateParams,
    handler: async (params) => {
      await requireServices().external.create(params)
      return { applied: true }
    }
  }),
  defineMethod({
    name: 'automation.externalUpdate',
    params: ExternalAutomationUpdateParams,
    handler: async (params) => {
      await requireServices().external.update(params)
      return { applied: true }
    }
  }),
  defineMethod({
    name: 'automation.externalAction',
    params: ExternalAutomationActionParams,
    handler: async (params) => {
      await requireServices().external.runAction(params)
      return { applied: true }
    }
  }),
  defineMethod({
    name: 'automation.precheck',
    params: AutomationRunPrecheckParams,
    handler: (params) => requireServices().precheck(params.automationId, params.runId)
  }),
  defineMethod({
    name: 'automation.snapshotWorkspaceName',
    params: AutomationSnapshotNameParams,
    handler: (params) => {
      requireServices().snapshotName(params.workspaceId, params.displayName)
      return { applied: true }
    }
  })
]
