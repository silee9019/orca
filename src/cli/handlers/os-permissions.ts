import { requireAccountsPermissionsExecutionHost } from '../accounts-permissions-host-boundary'
import { readBoundedCliJsonFile } from '../bounded-json-file'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { z } from 'zod'
import type { CommandHandler } from '../dispatch'
import { getOptionalStringFlag, getRequiredStringFlag, getOptionalNumberFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'
import {
  DeveloperPermissionRequestParams,
  DeveloperPermissionSettingsParams,
  NotificationDispatchParams,
  NotificationSoundParams,
  OsPermissionConfirmedParams,
  OsPermissionViewerParams
} from '../../shared/rpc-contract/os-permissions-params'

const ClaimFile = z
  .object({ claimToken: z.uuid(), claimId: z.number().int().positive().optional() })
  .strict()
function confirmed(flags: Map<string, string | boolean>) {
  if (flags.get('confirm') !== 'true') {
    throw new RuntimeClientError('invalid_argument', 'Explicit --confirm true is required')
  }
  return OsPermissionConfirmedParams.parse({
    viewer: getRequiredStringFlag(flags, 'viewer'),
    confirm: true
  })
}
function viewer(flags: Map<string, string | boolean>) {
  return OsPermissionViewerParams.parse({ viewer: getRequiredStringFlag(flags, 'viewer') })
}
function rpc(
  method: string,
  params: (flags: Map<string, string | boolean>) => unknown = () => ({})
): CommandHandler {
  return async (ctx) => {
    requireAccountsPermissionsExecutionHost(ctx)
    const { client, flags, json } = ctx
    const input = params(flags)
    const result = await client.call(method, input)
    printResult(result, json, (value) => JSON.stringify(value, null, 2))
  }
}

export const OS_PERMISSION_HANDLERS: Record<string, CommandHandler> = {
  'notification play-sound': rpc('notifications.playSound', (flags) =>
    NotificationSoundParams.parse({
      ...confirmed(flags),
      force: flags.get('force') === true,
      volume: getOptionalNumberFlag(flags, 'volume')
    })
  ),
  'computer permission-status': rpc('computer.permissionsStatus'),
  'computer permissions-reset': rpc('computer.permissionsReset', confirmed),
  'permissions status': rpc('developerPermissions.getStatus'),
  'permissions request': rpc('developerPermissions.request', (flags) =>
    DeveloperPermissionRequestParams.parse({
      ...confirmed(flags),
      id: getRequiredStringFlag(flags, 'id')
    })
  ),
  'permissions open-settings': rpc('developerPermissions.openSettings', (flags) =>
    DeveloperPermissionSettingsParams.parse({
      ...confirmed(flags),
      id: getRequiredStringFlag(flags, 'id')
    })
  ),
  'permissions daemon-attribution': rpc('pty.macTccAttribution'),
  'permissions tcc status': rpc('macosTccPrompts.getStatus'),
  'permissions tcc consume': async (ctx) => {
    requireAccountsPermissionsExecutionHost(ctx)
    const { client, flags, json } = ctx
    const path = getRequiredStringFlag(flags, 'claim-file')
    const claimToken = randomUUID()
    await writeFile(path, JSON.stringify({ claimToken }), { mode: 0o600, flag: 'wx' })
    const result = await client.call<{ claimId: number; promptCount: number } | null>(
      'macosTccPrompts.consumePending',
      { claimToken }
    )
    if (result.result) {
      await writeFile(path, JSON.stringify({ claimToken, claimId: result.result.claimId }), {
        mode: 0o600
      })
    }
    printResult(result, json, (value) => JSON.stringify(value, null, 2))
  },
  'permissions tcc acknowledge': async (ctx) => {
    requireAccountsPermissionsExecutionHost(ctx)
    const { client, flags, json } = ctx
    const claim = ClaimFile.parse(
      await readBoundedCliJsonFile(getRequiredStringFlag(flags, 'claim-file'), 1024)
    )
    if (!claim.claimId) {
      throw new RuntimeClientError('invalid_argument', 'The claim file has no pending claim')
    }
    const result = await client.call('macosTccPrompts.acknowledgePending', claim)
    printResult(result, json, (value) => JSON.stringify(value, null, 2))
  },
  'permissions tcc release': async (ctx) => {
    requireAccountsPermissionsExecutionHost(ctx)
    const { client, flags, json } = ctx
    const claim = ClaimFile.parse(
      await readBoundedCliJsonFile(getRequiredStringFlag(flags, 'claim-file'), 1024)
    )
    const result = await client.call('macosTccPrompts.releasePending', claim)
    printResult(result, json, (value) => JSON.stringify(value, null, 2))
  },
  'permissions tcc dismiss': rpc('macosTccPrompts.dismiss', confirmed),
  'notification permission-status': rpc('notifications.getPermissionStatus', viewer),
  'notification away-status': rpc('notifications.getDesktopAwayState', viewer),
  'notification probe': rpc('notifications.probeDelivery', (flags) => ({
    ...confirmed(flags),
    force: flags.get('force') === true
  })),
  'notification open-settings': rpc('notifications.openSystemSettings', confirmed),
  'notification dispatch': async (ctx) => {
    requireAccountsPermissionsExecutionHost(ctx)
    const { client, flags, json } = ctx
    const target = confirmed(flags)
    const request: unknown = await readBoundedCliJsonFile(
      getRequiredStringFlag(flags, 'request-file'),
      65536
    )
    const input = NotificationDispatchParams.parse({ ...target, request })
    const result = await client.call('notifications.dispatch', input)
    printResult(result, json, (value) => JSON.stringify(value, null, 2))
  },
  'notification dismiss': rpc('notifications.dismiss', (flags) => {
    const paneKey = getOptionalStringFlag(flags, 'pane-key')
    return {
      ...viewer(flags),
      ids: [getRequiredStringFlag(flags, 'id')],
      ...(paneKey ? { paneKeys: [paneKey] } : {})
    }
  })
}
