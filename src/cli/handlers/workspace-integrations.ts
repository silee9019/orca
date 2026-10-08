import type { CommandHandler, HandlerContext } from '../dispatch'
import { printWorkspaceCommandResult as printResult } from '../workspace-command-result'
import { RuntimeClientError } from '../runtime-client'
import { confirmWorkspaceCommand, readWorkspaceCommandInput } from '../workspace-command-input'
import {
  Connect as JiraConnect,
  SelectSite,
  SiteSelection
} from '../../shared/rpc-contract/jira-params'
import {
  Connect as LinearConnect,
  ConcreteWorkspaceId,
  SelectWorkspace
} from '../../shared/rpc-contract/linear-params'

async function runPrivateConnectionCommand(
  ctx: HandlerContext,
  method: 'jira.connect' | 'linear.connect' | 'jira.testConnection' | 'linear.testConnection',
  params: unknown
): Promise<void> {
  try {
    const response = await ctx.client.call<{ ok?: unknown }>(method, params)
    if (response.result?.ok !== true) {
      throw new RuntimeClientError(
        'connection_failed',
        'Connection failed. Check the credential file and host connection status.'
      )
    }
    printResult({ ...response, result: { ok: true } }, ctx.json, () => 'Connected.')
  } catch (error) {
    throw new RuntimeClientError(
      error instanceof RuntimeClientError ? error.code : 'connection_failed',
      'Connection failed. Check the credential file and host connection status.'
    )
  }
}

export const WORKSPACE_INTEGRATION_HANDLERS: Record<string, CommandHandler> = {
  'jira connect': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, JiraConnect)
    await runPrivateConnectionCommand(ctx, 'jira.connect', params)
  },
  'linear connect': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, LinearConnect)
    await runPrivateConnectionCommand(ctx, 'linear.connect', params)
  },
  'jira test-connection': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, SiteSelection)
    await runPrivateConnectionCommand(ctx, 'jira.testConnection', params)
  },
  'jira disconnect': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, SelectSite)
    confirmWorkspaceCommand(ctx, params.siteId)
    const result = await ctx.client.call('jira.disconnect', params)
    printResult(result, ctx.json, () => 'Disconnected.')
  },
  'linear disconnect': async (ctx) => {
    const params = await readWorkspaceCommandInput(
      ctx,
      SelectWorkspace.extend({ workspaceId: ConcreteWorkspaceId })
    )
    confirmWorkspaceCommand(ctx, params.workspaceId)
    const result = await ctx.client.call('linear.disconnect', params)
    printResult(result, ctx.json, () => 'Disconnected.')
  },
  'jira select-site': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, SelectSite)
    const result = await ctx.client.call('jira.selectSite', params)
    printResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'linear select-workspace': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, SelectWorkspace)
    const result = await ctx.client.call('linear.selectWorkspace', params)
    printResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'linear connection-status': async (ctx) => {
    const result = await ctx.client.call('linear.status')
    printResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'linear test-connection': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, SelectWorkspace)
    await runPrivateConnectionCommand(ctx, 'linear.testConnection', params)
  }
}
