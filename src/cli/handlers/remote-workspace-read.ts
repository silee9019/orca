import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { readAgentSessionRequest } from './agent-session-request'
import {
  RemoteWorkspaceReadParams,
  RemoteWorkspaceClientsParams
} from '../../shared/rpc-contract/remote-workspace-read-params'

export const REMOTE_WORKSPACE_READ_HANDLERS: Record<string, CommandHandler> = {
  'agent remote-workspace state': async (ctx) => {
    const params = await readAgentSessionRequest(ctx, RemoteWorkspaceReadParams)
    const response = await ctx.client.call('remoteWorkspace.get', params)
    printResult(response, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'agent remote-workspace clients': async (ctx) => {
    const params = await readAgentSessionRequest(ctx, RemoteWorkspaceClientsParams)
    const response = await ctx.client.call('remoteWorkspace.listConnectedClients', params)
    printResult(response, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'agent remote-workspace targets': async (ctx) => {
    const response = await ctx.client.call('remoteWorkspace.listEnabledConnectedTargets', {})
    printResult(response, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'agent remote-workspace client-id': async (ctx) => {
    const response = await ctx.client.call('remoteWorkspace.clientId', {})
    printResult(response, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
