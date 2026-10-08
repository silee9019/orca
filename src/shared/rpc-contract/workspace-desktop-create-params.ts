import { z } from 'zod'
import { ExecutionHostId } from './automation-params'
import {
  OptionalTuiAgent,
  AutomationWorkspaceProvenanceRequest,
  assertLinkedWorkItemSourceContextMatch
} from './worktree-params'
import { WorkspaceLinkedItemSchema } from '../workspace-linked-item-schema'
import { TaskSourceContextSchema } from '../task-source-context-schema'
import { sleepingAgentLaunchConfigSchema } from '../workspace-session-sleeping-agents'
import { isWorkspaceKey } from '../workspace-scope'
import type { WorkspaceKey } from '../folder-workspace-types'
const Text = z.string().min(1).max(4096)
const LinkedNumber = z.number().int().positive().optional()
const LaunchConfig = z
  .unknown()
  .transform((value, ctx) => {
    const result = sleepingAgentLaunchConfigSchema.safeParse(value)
    if (!result.success || !result.data) {
      ctx.addIssue({ code: 'custom', message: 'Invalid launch configuration.' })
      return z.NEVER
    }
    return result.data
  })
  .optional()
export const DesktopWorktreeCreate = z
  .object({
    expectedExecutionHostId: z.literal('local'),
    expectedRepoHostId: ExecutionHostId,
    repoId: Text,
    name: Text,
    nameWasGenerated: z.boolean().optional(),
    displayName: z.string().max(4096).optional(),
    displayNameKind: z.enum(['generated', 'user']).optional(),
    baseBranch: Text.optional(),
    compareBaseRef: Text.optional(),
    branchNameOverride: Text.optional(),
    setupDecision: z.enum(['run', 'skip', 'inherit']),
    sparseCheckout: z
      .object({ directories: z.array(Text).max(10000), presetId: Text.optional() })
      .strict()
      .optional(),
    linkedIssue: LinkedNumber,
    linkedPR: LinkedNumber,
    linkedGitLabIssue: LinkedNumber,
    linkedGitLabMR: LinkedNumber,
    linkedLinearIssue: Text.optional(),
    linkedLinearIssueWorkspaceId: Text.nullable().optional(),
    linkedLinearIssueOrganizationUrlKey: Text.nullable().optional(),
    linkedBitbucketPR: z.number().int().positive().nullable().optional(),
    linkedAzureDevOpsPR: z.number().int().positive().nullable().optional(),
    linkedGiteaPR: z.number().int().positive().nullable().optional(),
    linkedWorkItem: WorkspaceLinkedItemSchema.nullable().optional(),
    linkedTaskSourceContext: TaskSourceContextSchema.nullable().optional(),
    pushTarget: z.object({ remoteName: Text, branchName: Text }).strict().optional(),
    workspaceStatus: Text.optional(),
    manualOrder: z.number().finite().optional(),
    parentWorkspace: z
      .custom<WorkspaceKey>((value) => typeof value === 'string' && isWorkspaceKey(value))
      .optional(),
    createdWithAgent: OptionalTuiAgent,
    pendingFirstAgentMessageRename: z.boolean().optional(),
    startup: z
      .object({
        command: z.string().min(1).max(100000),
        env: z.record(z.string(), z.string()).optional(),
        launchConfig: LaunchConfig,
        viewMode: z.enum(['terminal', 'chat']).optional(),
        startupCommandDelivery: z.enum(['fast', 'shell-ready']).optional()
      })
      .strict()
      .optional(),
    automationProvenanceRequest: AutomationWorkspaceProvenanceRequest.strict().optional()
  })
  .strict()
  .superRefine((params, ctx) => {
    assertLinkedWorkItemSourceContextMatch(params, ctx)
    if (params.pendingFirstAgentMessageRename && !params.createdWithAgent) {
      ctx.addIssue({ code: 'custom', message: 'Rename reservation requires a selected agent.' })
    }
  })
export function getDesktopCreateConfirmation(
  params: z.infer<typeof DesktopWorktreeCreate>
): string {
  return `${params.repoId}:${params.expectedRepoHostId}:${params.name}`
}
