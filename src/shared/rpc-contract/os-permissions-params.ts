import { z } from 'zod'
import { AGENT_STATUS_STATES } from '../agent-status-types'
import { AGENT_TURN_OUTCOMES } from '../agent-turn-outcome'
import { parseExecutionHostId } from '../execution-host'

export const OsPermissionEmptyParams = z.object({}).strict()
export const OsPermissionViewerParams = z.object({ viewer: z.literal('desktop') }).strict()
export const OsPermissionConfirmedParams = OsPermissionViewerParams.extend({
  confirm: z.literal(true)
})
export const DeveloperPermissionIdSchema = z.enum([
  'microphone',
  'camera',
  'screen',
  'accessibility',
  'full-disk-access',
  'automation',
  'local-network',
  'usb',
  'bluetooth'
])
export const DeveloperPermissionRequestParams = OsPermissionConfirmedParams.extend({
  id: DeveloperPermissionIdSchema
})
export const DeveloperPermissionSettingsParams = OsPermissionConfirmedParams.extend({
  id: z.union([DeveloperPermissionIdSchema, z.literal('files-and-folders')])
})
export const TccPromptOwnerParams = z.object({ claimToken: z.uuid() }).strict()
export const TccPromptClaimParams = TccPromptOwnerParams.extend({
  claimId: z.number().int().positive()
})
export const TccPromptReleaseParams = TccPromptOwnerParams.extend({
  claimId: z.number().int().positive().optional()
})
export const NotificationProbeParams = OsPermissionConfirmedParams.extend({
  force: z.boolean().optional()
})
export const NotificationDismissParams = OsPermissionViewerParams.extend({
  ids: z.array(z.string().min(1)).max(100),
  paneKeys: z.array(z.string().min(1)).max(100).optional()
})
export const NotificationDispatchParams = OsPermissionConfirmedParams.extend({
  request: z
    .object({
      source: z.enum(['agent-task-complete', 'terminal-bell', 'test']),
      notificationId: z.string().min(1).max(256).optional(),
      requireDisplayConfirmation: z.boolean().optional(),
      worktreeId: z.string().min(1).optional(),
      notificationSourceId: z
        .union([
          z.literal('local'),
          z.templateLiteral(['ssh:', z.string().min(1)]),
          z.templateLiteral(['runtime:', z.string().min(1)])
        ])
        .refine((value) => parseExecutionHostId(value) !== null)
        .optional(),
      hasMultipleActiveRepos: z.boolean().optional(),
      agentType: z.string().min(1).max(256).optional(),
      agentState: z.enum(AGENT_STATUS_STATES).optional(),
      agentPrompt: z.string().max(8192).optional(),
      agentToolName: z.string().max(256).optional(),
      agentToolInput: z.string().max(8192).optional(),
      agentTurnOutcome: z.enum(AGENT_TURN_OUTCOMES).optional(),
      paneKey: z.string().min(1).optional(),
      repoLabel: z.string().max(256).optional(),
      worktreeLabel: z.string().max(256).optional(),
      terminalTitle: z.string().max(256).optional(),
      isActiveWorktree: z.boolean().optional(),
      agentLastAssistantMessage: z.string().max(8192).optional(),
      surface: z.enum(['terminal', 'agent-session']).optional()
    })
    .strict()
})

export const NotificationSoundParams = OsPermissionConfirmedParams.extend({
  force: z.boolean().optional(),
  volume: z.number().min(0).max(100).optional()
})
