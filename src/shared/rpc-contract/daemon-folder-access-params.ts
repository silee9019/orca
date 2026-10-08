import { z } from 'zod'
import { MAC_TCC_FOLDER_CLASSES } from '../daemon-adoption-telemetry'

const Pin = z.object({
  runtimeId: z.string().min(1).max(256),
  executionHostId: z.literal('local'),
  daemonIdentityDigest: z.string().regex(/^[a-f0-9]{64}$/),
  targetDigest: z.string().regex(/^[a-f0-9]{64}$/)
})
export const DaemonFolderAccessPlanParams = z.object({}).strict()
export const DaemonFolderAccessPlan = Pin.extend({
  cwdClass: z.enum(MAC_TCC_FOLDER_CLASSES),
  humanResponseRequired: z.literal(true),
  resetsAppFolderPermission: z.literal(true)
}).strict()
export const DaemonFolderAccessStartParams = Pin.extend({
  operationId: z.string().uuid(),
  confirm: z.literal(true),
  allowOsPrompt: z.literal(true)
}).strict()
export const DaemonFolderAccessStatusParams = Pin.extend({
  operationId: z.string().uuid()
}).strict()
export const DaemonFolderAccessCancelParams = DaemonFolderAccessStatusParams.extend({
  confirm: z.literal(true)
}).strict()
export const DaemonFolderAccessVerifyParams = DaemonFolderAccessCancelParams.extend({
  humanResponded: z.literal(true)
}).strict()
export type DaemonFolderAccessStatusParams = z.output<typeof DaemonFolderAccessStatusParams>
export const DaemonFolderAccessReceipt = DaemonFolderAccessStatusParams.extend({
  state: z.enum(['running', 'awaiting_human', 'verified', 'failed', 'cancelled']),
  resetWorkInFlight: z.boolean(),
  freshDaemonAccess: z.enum(['allowed', 'denied', 'unknown']),
  permissionConfirmed: z.boolean(),
  osPromptMayRemain: z.literal(true),
  cancellationUndoesPermissionReset: z.literal(false)
})
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.permissionConfirmed !==
      (value.state === 'verified' &&
        value.freshDaemonAccess === 'allowed' &&
        !value.resetWorkInFlight)
    ) {
      ctx.addIssue({ code: 'custom', message: 'Invalid permission verification receipt' })
    }
  })
