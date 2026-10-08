import type { z } from 'zod'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { readJsonInput } from '../json-input'
import { RuntimeClientError } from '../runtime-client'
import {
  ProfileCreateParams,
  ProfileCloudCreateParams,
  ProfileUseParams,
  ProfileTransferParams,
  ProfileFindProjectsParams,
  ProfileOrgParams,
  ProfileOrgInviteParams,
  ProfileOrgRevokeParams,
  ProfileOrgRemoveParams,
  ProfileOrgRoleParams,
  ProfileCurrentParams
} from '../../shared/rpc-contract/orca-profile-params'

function request(method: string, schema?: z.ZodType): CommandHandler {
  return async (ctx) => {
    const parsed = schema?.safeParse(await readJsonInput(ctx))
    if (parsed && !parsed.success) {
      throw new RuntimeClientError('invalid_argument', 'Invalid profile request JSON')
    }
    printResult(await ctx.client.call(method, parsed?.data), ctx.json, (value) =>
      JSON.stringify(value, null, 2)
    )
  }
}
export const MANAGED_PROFILE_HANDLERS: Record<string, CommandHandler> = {
  'profile list': request('profile.list'),
  'profile auth-status': request('profile.authStatus'),
  'profile create': request('profile.createLocal', ProfileCreateParams),
  'profile create-cloud': request('profile.createCloudLinked', ProfileCloudCreateParams),
  'profile use': request('profile.use', ProfileUseParams),
  'profile transfer-project': request('profile.transferProject', ProfileTransferParams),
  'profile find-projects': request('profile.findProjects', ProfileFindProjectsParams),
  'profile auth-start': request('profile.authStart', ProfileCurrentParams),
  'profile auth-operation': async (ctx) => {
    printResult(
      await ctx.client.call('profile.authOperation', {
        operationId: getRequiredStringFlag(ctx.flags, 'operation')
      }),
      ctx.json,
      (value) => JSON.stringify(value, null, 2)
    )
  },
  'profile auth-cancel': async (ctx) => {
    printResult(
      await ctx.client.call('profile.authCancel', {
        operationId: getRequiredStringFlag(ctx.flags, 'operation')
      }),
      ctx.json,
      (value) => JSON.stringify(value, null, 2)
    )
  },
  'profile refresh-auth': request('profile.refreshAuth'),
  'profile sign-out': request('profile.signOut', ProfileCurrentParams),
  'profile select-org': request('profile.selectOrg', ProfileOrgParams),
  'profile org members': request('profile.orgMembers', ProfileOrgParams),
  'profile org invite': request('profile.orgInvite', ProfileOrgInviteParams),
  'profile org revoke-invite': request('profile.orgRevokeInvite', ProfileOrgRevokeParams),
  'profile org set-role': request('profile.orgSetRole', ProfileOrgRoleParams),
  'profile org remove-member': request('profile.orgRemoveMember', ProfileOrgRemoveParams)
}
