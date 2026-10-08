import { z } from 'zod'
import { WORKSPACE_CLEANUP_CLASSIFIER_VERSION } from '../workspace-cleanup'
import { ExecutionHostId } from './automation-params'
import { WorkspaceCleanupDismissal } from './workspace-cleanup-ui-params'

export const WorkspaceCleanupDismiss = z.object({
  dismissals: z.array(
    WorkspaceCleanupDismissal.extend({
      classifierVersion: z.literal(WORKSPACE_CLEANUP_CLASSIFIER_VERSION),
      executionHostId: ExecutionHostId.optional()
    })
  ),
  removedWorktreeIds: z.array(z.string()).optional()
})
