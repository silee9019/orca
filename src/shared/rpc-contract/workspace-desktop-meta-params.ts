import { z } from 'zod'
import { ExecutionHostId } from './automation-params'
import {
  OptionalTuiAgent,
  WorktreeSet,
  assertLinkedWorkItemSourceContextMatch
} from './worktree-params'
import { DiffCommentSchema } from '../diff-comment-schema'

const MobileReviewFile = z
  .object({
    key: z.string(),
    filePath: z.string(),
    oldPath: z.string().optional(),
    scope: z.enum(['unstaged', 'staged', 'branch']),
    lastOpenedAt: z.number().finite().optional(),
    lastSeenDiffIdentity: z.string().optional(),
    reviewedAt: z.number().finite().optional(),
    reviewDiffIdentity: z.string().optional()
  })
  .strict()

export const DesktopWorktreeMetaUpdate = z
  .object({
    worktreeId: z.string().min(1),
    executionHostId: ExecutionHostId,
    updates: z
      .object({
        instanceId: z.string().optional(),
        projectId: z.string().optional(),
        projectHostSetupId: z.string().optional(),
        ephemeralVmCheckoutMode: z.enum(['orca-worktree', 'provisioned-root']).optional(),
        displayName: z.string().optional(),
        displayNameIsPinned: z.boolean().optional(),
        comment: z.string().optional(),
        linkedIssue: WorktreeSet.shape.linkedIssue,
        linkedPR: WorktreeSet.shape.linkedPR,
        suppressedGitHubPR: WorktreeSet.shape.suppressedGitHubPR,
        linkedLinearIssue: WorktreeSet.shape.linkedLinearIssue,
        linkedLinearIssueWorkspaceId: WorktreeSet.shape.linkedLinearIssueWorkspaceId,
        linkedLinearIssueOrganizationUrlKey: WorktreeSet.shape.linkedLinearIssueOrganizationUrlKey,
        linkedGitLabMR: WorktreeSet.shape.linkedGitLabMR,
        linkedGitLabIssue: WorktreeSet.shape.linkedGitLabIssue,
        linkedBitbucketPR: WorktreeSet.shape.linkedBitbucketPR,
        linkedAzureDevOpsPR: WorktreeSet.shape.linkedAzureDevOpsPR,
        linkedGiteaPR: WorktreeSet.shape.linkedGiteaPR,
        linkedWorkItem: WorktreeSet.shape.linkedWorkItem,
        linkedTaskSourceContext: WorktreeSet.shape.linkedTaskSourceContext,
        isArchived: z.boolean().optional(),
        isUnread: z.boolean().optional(),
        isPinned: z.boolean().optional(),
        sortOrder: z.number().finite().optional(),
        manualOrder: z.number().finite().optional(),
        lastActivityAt: z.number().finite().optional(),
        createdAt: z.number().finite().optional(),
        createdWithAgent: OptionalTuiAgent,
        pendingFirstAgentMessageRename: z.boolean().optional(),
        firstAgentMessageRenameError: z.string().nullable().optional(),
        sparseDirectories: z.array(z.string()).optional(),
        sparseBaseRef: z.string().optional(),
        sparsePresetId: z.string().optional(),
        baseRef: z.string().optional(),
        preserveBranchOnDelete: z.boolean().optional(),
        pushTarget: z
          .object({
            remoteName: z.string(),
            branchName: z.string(),
            remoteUrl: z.string().optional()
          })
          .strict()
          .optional(),
        workspaceStatus: z.string().optional(),
        diffComments: z.array(DiffCommentSchema).optional(),
        priorWorktreeIds: z.array(z.string()).optional(),
        mobileDiffReview: z
          .object({
            version: z.literal(1),
            updatedAt: z.number().finite().optional(),
            completedAt: z.number().finite().optional(),
            files: z.record(z.string(), MobileReviewFile)
          })
          .strict()
          .optional()
      })
      .strict()
      .superRefine(assertLinkedWorkItemSourceContextMatch)
  })
  .strict()
