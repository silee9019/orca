import { z } from 'zod'
import { UiUpdateFields } from './rpc-contract/client-ui-params'

export const ActivityOriginKindSchema = z.enum(['cli', 'automation', 'other-client'])
export const ActivityViewerScopeSchema = z
  .object({
    visibleHostIds: UiUpdateFields.shape.agentsVisibleHostIds.unwrap(),
    filterRepoIds: UiUpdateFields.shape.agentsFilterRepoIds.unwrap(),
    hideOtherClients: UiUpdateFields.shape.agentsHideWorkspacesFromOtherDevices.unwrap(),
    hideAutomation: UiUpdateFields.shape.agentsHideAutomationGeneratedWorkspaces.unwrap(),
    hideCli: UiUpdateFields.shape.agentsHideCliCreatedWorkspaces.unwrap()
  })
  .strip()
export type ActivityViewerScope = z.infer<typeof ActivityViewerScopeSchema>
