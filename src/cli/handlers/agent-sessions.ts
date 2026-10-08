import {
  CreateAgentSessionParams,
  EnsureAgentSessionParams
} from '../../shared/rpc-contract/agent-session-params'
import { AgentStatusDismissParams } from '../../shared/rpc-contract/agent-status-cli-params'
import {
  DaemonManagementStopManyParams,
  DaemonManagementStopParams
} from '../../shared/rpc-contract/daemon-management-params'
import {
  AiVaultDeleteSessionParams,
  AiVaultSubagentSessionsParams
} from '../../shared/rpc-contract/ai-vault-session-actions-params'
import {
  TerminalHandle,
  TerminalInspectProcess
} from '../../shared/rpc-contract/terminal-unary-params'
import { TerminalSetDisplayMode } from '../../shared/rpc-contract/terminal-viewport-schemas-params'
import {
  MoveTab,
  SetTabProps,
  UpdatePaneLayout,
  WorktreeTabSelector
} from '../../shared/rpc-contract/session-tabs-schemas-params'
import {
  AiVaultListSessionsParams,
  AiVaultPrepareSessionResumeParams,
  AiVaultSessionTitlesParams
} from '../../shared/rpc-contract/ai-vault-params'
import { NativeChatSession } from '../../shared/rpc-contract/native-chat-params'
import { z } from 'zod'
import {
  AgentsParams,
  CancelParams,
  ConversationCommandParams,
  CreateIntentParams,
  CreateSupportParams,
  HistoryParams,
  JournalCursor,
  ModelCatalogParams,
  OptionsParams,
  QueuedMessageActionParams,
  QueuedMessagesResumeParams,
  RespondParams,
  RespondToQuestionParams,
  RestartResumeParams,
  RewindParams,
  SendParams,
  SetOptionParams,
  ThreadGoalParams
} from '../../shared/rpc-contract/structured-agent-session-params'
import type { CommandHandler, HandlerContext } from '../dispatch'
import {
  getOptionalJsonFlag,
  getOptionalPositiveIntegerFlag,
  getOptionalStringFlag,
  getRequiredStringFlag
} from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime/types'
import { readAgentSessionRequest } from './agent-session-request'

const refusal = z.object({
  ok: z.literal(false),
  refusal: z.object({ code: z.string(), message: z.string() })
})

async function call(ctx: HandlerContext, method: string, params: unknown): Promise<void> {
  const response = await ctx.client.call<unknown>(method, params)
  if (method === 'daemon.sessions.stop' || method === 'daemon.sessions.stopMany') {
    const stopped = z.object({ verdict: z.object({ status: z.literal('exited') }) })
    const complete =
      method === 'daemon.sessions.stop'
        ? stopped.safeParse(response.result).success
        : z.object({ results: z.array(stopped).min(1) }).safeParse(response.result).success
    if (!complete) {
      throw new RuntimeClientError(
        'daemon_stop_unconfirmed',
        'The owning daemon did not confirm every requested process exited.',
        response.result
      )
    }
  }
  if (method === 'aiVault.deleteSession') {
    const result = z
      .discriminatedUnion('outcome', [
        z.object({ outcome: z.literal('deleted') }),
        z.object({ outcome: z.literal('rejected'), reason: z.string() }),
        z.object({ outcome: z.literal('failed') })
      ])
      .safeParse(response.result)
    if (!result.success || result.data.outcome !== 'deleted') {
      throw new RuntimeClientError(
        'ai_vault_delete_rejected',
        result.success && result.data.outcome === 'rejected'
          ? result.data.reason
          : 'Could not trash session on the execution host.'
      )
    }
  }
  const denied = refusal.safeParse(response.result)
  if (denied.success) {
    throw new RuntimeClientError(denied.data.refusal.code, denied.data.refusal.message)
  }
  printResult(response, ctx.json, (value) => JSON.stringify(value, null, 2))
}

function request<T>(method: string, schema: z.ZodType<T>): CommandHandler {
  return async (ctx) => call(ctx, method, await readAgentSessionRequest(ctx, schema))
}

function sessionRead(method: string): CommandHandler {
  return async (ctx) => {
    const parsed = OptionsParams.safeParse({
      sessionId: getRequiredStringFlag(ctx.flags, 'session')
    })
    if (!parsed.success) {
      throw new RuntimeClientError('invalid_argument', 'Invalid --session.')
    }
    await call(ctx, method, parsed.data)
  }
}

export const AGENT_SESSION_HANDLERS: Record<string, CommandHandler> = {
  'terminal daemon list': async (ctx) => call(ctx, 'daemon.sessions.list', {}),
  'terminal daemon stop': request('daemon.sessions.stop', DaemonManagementStopParams),
  'terminal daemon stop-many': request('daemon.sessions.stopMany', DaemonManagementStopManyParams),
  'terminal clear': request('terminal.clearBuffer', TerminalHandle),
  'terminal reset-input': request('terminal.resetInputModes', TerminalHandle),
  'terminal inspect-process': request('terminal.inspectProcess', TerminalInspectProcess),
  'terminal identity': request('terminal.resolveIdentity', TerminalHandle),
  'terminal agent-status': request('terminal.agentStatus', TerminalHandle),
  'terminal restore-fit': request('terminal.restoreFit', TerminalHandle),
  'terminal display-mode': request('terminal.getDisplayMode', TerminalHandle),
  'terminal set-display-mode': request('terminal.setDisplayMode', TerminalSetDisplayMode),
  'terminal tabs': request('session.tabs.list', WorktreeTabSelector),
  'terminal move-tab': request('session.tabs.move', MoveTab),
  'terminal set-tab': request('session.tabs.setTabProps', SetTabProps),
  'terminal set-layout': request('session.tabs.updatePaneLayout', UpdatePaneLayout),
  'agent terminal create': request('terminal.createAgentSession', CreateAgentSessionParams),
  'agent terminal ensure': request('terminal.ensureAgentSession', EnsureAgentSessionParams),
  'agent session close': sessionRead('agentSession.close'),
  'agent session reveal': sessionRead('agentSession.reveal'),
  'agent status list': async (ctx) => call(ctx, 'agentStatus.list', {}),
  'agent status dismiss': request('agentStatus.dismiss', AgentStatusDismissParams),
  'agent status migration': async (ctx) => call(ctx, 'agentStatus.migration', {}),
  'agent history delete': request('aiVault.deleteSession', AiVaultDeleteSessionParams),
  'agent history subagents': request('aiVault.listSubagentSessions', AiVaultSubagentSessionsParams),
  'agent history list': request('aiVault.listSessions', AiVaultListSessionsParams),
  'agent history titles': request('aiVault.resolveSessionTitles', AiVaultSessionTitlesParams),
  'agent history resume-plan': request(
    'aiVault.prepareSessionResume',
    AiVaultPrepareSessionResumeParams
  ),
  'agent history read': request('nativeChat.readSession', NativeChatSession),
  'agent session agents': async (ctx) => call(ctx, 'agentSession.agents', AgentsParams.parse({})),
  'agent session create-support': async (ctx) => {
    const parsed = CreateSupportParams.safeParse({
      worktree: getRequiredStringFlag(ctx.flags, 'worktree'),
      agent: getRequiredStringFlag(ctx.flags, 'agent')
    })
    if (!parsed.success) {
      throw new RuntimeClientError('invalid_argument', 'Invalid --worktree or --agent.')
    }
    await call(ctx, 'agentSession.createSupport', parsed.data)
  },
  'agent session history': async (ctx) => {
    let cursor: unknown
    const raw = getOptionalJsonFlag(ctx.flags, 'cursor')
    if (raw !== undefined) {
      try {
        cursor = JSON.parse(raw)
      } catch {
        throw new RuntimeClientError('invalid_argument', 'Invalid --cursor JSON.')
      }
      if (!JournalCursor.safeParse(cursor).success) {
        throw new RuntimeClientError('invalid_argument', 'Invalid --cursor.')
      }
    }
    const parsed = HistoryParams.safeParse({
      sessionId: getRequiredStringFlag(ctx.flags, 'session'),
      direction: getOptionalStringFlag(ctx.flags, 'direction') ?? 'tail',
      limit: getOptionalPositiveIntegerFlag(ctx.flags, 'limit'),
      ...(cursor === undefined ? {} : { cursor })
    })
    if (!parsed.success) {
      throw new RuntimeClientError('invalid_argument', 'Invalid session history arguments.')
    }
    await call(ctx, 'agentSession.history', parsed.data)
  },
  'agent session options': sessionRead('agentSession.options'),
  'agent session commands': sessionRead('agentSession.commands'),
  'agent session outline': sessionRead('agentSession.conversationOutline'),
  'agent session handoff-status': sessionRead('agentSession.handoffStatus'),
  'agent session model-catalog': request('agentSession.modelCatalog', ModelCatalogParams),
  'agent session create': request('agentSession.create', CreateIntentParams),
  'agent session send': request('agentSession.send', SendParams),
  'agent session cancel': request('agentSession.cancel', CancelParams),
  'agent session respond-approval': request('agentSession.respondToApproval', RespondParams),
  'agent session respond-question': request(
    'agentSession.respondToQuestion',
    RespondToQuestionParams
  ),
  'agent session set-option': request('agentSession.setOption', SetOptionParams),
  'agent session conversation-command': request(
    'agentSession.conversationCommand',
    ConversationCommandParams
  ),
  'agent session rewind': request('agentSession.rewind', RewindParams),
  'agent session thread-goal': request('agentSession.threadGoal', ThreadGoalParams),
  'agent session queued-send': request('agentSession.queuedMessageSend', QueuedMessageActionParams),
  'agent session queued-delete': request(
    'agentSession.queuedMessageDelete',
    QueuedMessageActionParams
  ),
  'agent session queued-resume': request(
    'agentSession.queuedMessagesResume',
    QueuedMessagesResumeParams
  ),
  'agent session restart-list': async (ctx) => call(ctx, 'agentSession.restartResumable', {}),
  'agent session restart-dismiss': request(
    'agentSession.restartResumableDismiss',
    RestartResumeParams
  ),
  'agent session restart-continue': request('agentSession.restartContinue', RestartResumeParams)
}
