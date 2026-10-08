import { z } from 'zod'
import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime/types'
import { readAgentSessionRequest } from './agent-session-request'
import { RemoteWorkspacePublishParams } from '../../shared/rpc-contract/remote-workspace-publish-params'
import { requireLosslessWorkspaceSession } from '../../shared/node-workspace-session-validation'

export const REMOTE_WORKSPACE_PUBLISH_HANDLERS: Record<string, CommandHandler> = {
  'terminal publish-workspace': async (ctx) => {
    const params = await readAgentSessionRequest(ctx, RemoteWorkspacePublishParams)
    if (params.session !== undefined) {
      try {
        requireLosslessWorkspaceSession(params.session)
      } catch {
        throw new RuntimeClientError(
          'invalid_argument',
          'Session input requires repair, drops fields or has invalid values.'
        )
      }
    }
    const response = await ctx.client.call('remoteWorkspace.publishTargets', params)
    printResult(response, ctx.json, (value) => JSON.stringify(value))
    if (!z.object({ allTargetsAccepted: z.literal(true) }).safeParse(response.result).success) {
      process.exitCode = 1
    }
  }
}
