import { z } from 'zod'
import type {
  PRInfo,
  IssueInfo,
  GitHubPRStack,
  GitHubPRStackEntry,
  GitHubPRMergeMethodSettings,
  GitHubRepositoryIdentity,
  PRConflictSummary
} from '../github/pull-request-types'
import type { PersistedState } from '../persisted-state-types'

const PRState = z.enum(['open', 'closed', 'merged', 'draft'])
const CheckStatus = z.enum(['pending', 'success', 'failure', 'neutral'])
const Mergeable = z.enum(['MERGEABLE', 'CONFLICTING', 'UNKNOWN'])
const ReviewDecision = z.enum(['APPROVED', 'CHANGES_REQUESTED', 'REVIEW_REQUIRED'])
const RepositoryIdentity = z
  .object({ owner: z.string(), repo: z.string(), host: z.string().optional() })
  .strict() satisfies z.ZodType<GitHubRepositoryIdentity>
const MergeMethods = z
  .object({
    defaultMethod: z.enum(['merge', 'squash', 'rebase']),
    allowedMethods: z
      .object({ merge: z.boolean(), squash: z.boolean(), rebase: z.boolean() })
      .strict()
  })
  .strict() satisfies z.ZodType<GitHubPRMergeMethodSettings>
const StackEntry = z
  .object({
    position: z.number(),
    number: z.number(),
    title: z.string(),
    url: z.string(),
    updatedAt: z.string().optional(),
    state: PRState,
    checksStatus: CheckStatus,
    mergeable: Mergeable,
    reviewDecision: ReviewDecision.nullable().optional(),
    mergeStateStatus: z.string().nullable().optional(),
    headRefName: z.string().optional(),
    headSha: z.string().optional()
  })
  .strict() satisfies z.ZodType<GitHubPRStackEntry>
const Stack = z
  .object({
    number: z.number(),
    position: z.number(),
    size: z.number(),
    baseRefName: z.string(),
    baseSha: z.string().optional(),
    entries: z.array(StackEntry).optional()
  })
  .strict() satisfies z.ZodType<GitHubPRStack>
const ConflictSummary = z
  .object({
    baseRef: z.string(),
    baseCommit: z.string(),
    commitsBehind: z.number(),
    files: z.array(z.string()),
    localMergeState: z.literal('clean').optional()
  })
  .strict() satisfies z.ZodType<PRConflictSummary>
const CachedPullRequest = z
  .object({
    number: z.number(),
    title: z.string(),
    state: PRState,
    url: z.string(),
    checksStatus: CheckStatus,
    updatedAt: z.string(),
    mergeable: Mergeable,
    reviewDecision: ReviewDecision.nullable().optional(),
    autoMergeEnabled: z.boolean().optional(),
    autoMergeAllowed: z.boolean().nullable().optional(),
    mergeQueueRequired: z.boolean().nullable().optional(),
    mergeMethodSettings: MergeMethods.optional(),
    mergeStateStatus: z.string().nullable().optional(),
    stack: Stack.optional(),
    headSha: z.string().optional(),
    confirmedContainedHeadOid: z.string().optional(),
    headDivergedFromMergedPRAtOid: z.string().optional(),
    baseRefName: z.string().optional(),
    headRefName: z.string().optional(),
    prRepo: RepositoryIdentity.optional(),
    headRepo: RepositoryIdentity.optional(),
    conflictSummary: ConflictSummary.optional()
  })
  .strict() satisfies z.ZodType<PRInfo>
const CachedIssue = z
  .object({
    number: z.number(),
    title: z.string(),
    state: z.enum(['open', 'closed']),
    url: z.string(),
    labels: z.array(z.string()),
    description: z.string().optional()
  })
  .strict() satisfies z.ZodType<IssueInfo>

const CacheKey = z
  .string()
  .refine((key) => !['__proto__', 'constructor', 'prototype'].includes(key))
export const WorkspaceGitHubCache = z
  .object({
    pr: z.record(
      CacheKey,
      z.object({ data: CachedPullRequest.nullable(), fetchedAt: z.number() }).strict()
    ),
    issue: z.record(
      CacheKey,
      z.object({ data: CachedIssue.nullable(), fetchedAt: z.number() }).strict()
    )
  })
  .strict() satisfies z.ZodType<PersistedState['githubCache']>
export const WorkspaceGitHubCacheWriteParams = z
  .object({
    confirm: z.literal(true),
    expected: WorkspaceGitHubCache,
    next: WorkspaceGitHubCache
  })
  .strict()
