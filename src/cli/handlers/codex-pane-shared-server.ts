import type { CommandHandler, HandlerContext } from '../dispatch'
import { printResult } from '../format'
import { readAgentSessionRequest } from './agent-session-request'
import {
  CodexPaneSharedServerMutationParams,
  CodexPaneSharedServerStatusParams
} from '../../shared/rpc-contract/codex-pane-shared-server-params'

async function invoke(ctx: HandlerContext, method: string, mutation: boolean) {
  const params = mutation
    ? await readAgentSessionRequest(ctx, CodexPaneSharedServerMutationParams)
    : await readAgentSessionRequest(ctx, CodexPaneSharedServerStatusParams)
  const response = await ctx.client.call(method, params)
  printResult(response, ctx.json, (value) => JSON.stringify(value, null, 2))
}

export const CODEX_PANE_SHARED_SERVER_HANDLERS: Record<string, CommandHandler> = {
  'agent codex-server status': (ctx) => invoke(ctx, 'terminal.codexSharedServerStatus', false),
  'agent codex-server disable-auto-start': (ctx) =>
    invoke(ctx, 'terminal.disableCodexSharedServerAutoStart', true),
  'agent codex-server stop': (ctx) => invoke(ctx, 'terminal.stopCodexSharedServer', true)
}
