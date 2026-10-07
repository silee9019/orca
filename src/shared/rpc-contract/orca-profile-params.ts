import { z } from 'zod'
import { normalizeExecutionHostId } from '../execution-host'

const profileId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/)
export const ProfileCreateParams = z.strictObject({
  name: z.string().trim().min(1).max(80).optional()
})
export const ProfileCloudCreateParams = ProfileCreateParams.extend({
  orgId: z.string().trim().min(1).optional()
})
export const ProfileUseParams = z.strictObject({ profileId, currentProfileId: profileId })
export const ProfileCurrentParams = z.strictObject({ currentProfileId: profileId })
export const ProfileTransferParams = z.strictObject({
  sourceProfileId: profileId,
  targetProfileId: profileId,
  repoId: z.string().min(1),
  mode: z.enum(['move', 'copy']),
  currentProfileId: profileId
})
export const ProfileFindProjectsParams = z.strictObject({
  path: z.string().trim().min(1),
  connectionId: z.string().nullable().optional(),
  excludeProfileId: profileId.nullable().optional(),
  executionHostId: z
    .string()
    .transform((value, ctx) => {
      const host = normalizeExecutionHostId(value)
      if (host) {
        return host
      }
      ctx.addIssue({ code: 'custom', message: 'Invalid execution host' })
      return z.NEVER
    })
    .nullable()
    .optional()
})
export const ProfileOrgParams = z.strictObject({ orgId: z.string().trim().min(1).max(128) })
export const ProfileOrgInviteParams = ProfileOrgParams.extend({
  email: z.string().trim().min(1).max(512),
  role: z.enum(['owner', 'admin', 'member'])
})
export const ProfileOrgRevokeParams = ProfileOrgParams.extend({
  email: ProfileOrgInviteParams.shape.email
})
export const ProfileOrgRemoveParams = ProfileOrgParams.extend({
  userId: z.string().trim().min(1).max(128)
})
export const ProfileOrgRoleParams = ProfileOrgRemoveParams.extend({
  role: ProfileOrgInviteParams.shape.role
})
export const ProfileAuthOperationParams = z.strictObject({ operationId: z.string().uuid() })
