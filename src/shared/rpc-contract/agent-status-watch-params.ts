import { AGENT_TURN_OUTCOMES } from '../agent-turn-outcome'
import { z } from 'zod'
import { MAX_TIMER_DELAY_MS } from '../timer-delay'
import { AGENT_STATUS_STATES } from '../agent-status-types'
import { AgentStatusDismissParams } from './agent-status-cli-params'

const unique = (values: string[]) => new Set(values).size === values.length
const paneKeys = z.array(AgentStatusDismissParams.shape.paneKey).min(1).max(128).refine(unique)
const connectionIds = z.array(z.string().min(1).max(512)).max(128).refine(unique)
const scope = z.object({ paneKeys, connectionIds })
export const AgentStatusWatchRequest = scope
  .extend({ watchMs: z.number().int().min(1).max(MAX_TIMER_DELAY_MS) })
  .strict()
export const AgentStatusSubscriptionParams = scope
  .extend({ subscriptionId: z.string().uuid() })
  .strict()
export type AgentStatusSubscriptionParams = z.output<typeof AgentStatusSubscriptionParams>
const sequence = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const timestamp = z.number().finite().nonnegative()
export const CliAgentStatusRow = z
  .object({
    paneKey: AgentStatusDismissParams.shape.paneKey,
    tabId: z.string().optional(),
    worktreeId: z.string().optional(),
    connectionId: z.string().nullable(),
    terminalHandle: z.string().optional(),
    agentType: z.string(),
    state: z.enum(AGENT_STATUS_STATES),
    mainAgent: z
      .object({
        state: z.enum(AGENT_STATUS_STATES),
        stateStartedAt: timestamp,
        outcome: z.enum(AGENT_TURN_OUTCOMES).optional()
      })
      .strict()
      .optional(),
    observation: z
      .object({ authorityId: z.string(), incarnation: sequence, revision: sequence })
      .strict()
      .optional(),
    receivedAt: timestamp,
    evidenceObservedAt: timestamp.optional(),
    stateStartedAt: timestamp,
    restoredUnconfirmed: z.boolean().optional(),
    providerSessionOnly: z.boolean().optional(),
    structuredHost: z.enum(['held', 'owned']).optional()
  })
  .strict()
export const AgentStatusClearFrame = z.union([
  z
    .object({
      paneKey: AgentStatusDismissParams.shape.paneKey,
      statusUnavailable: z.literal(true).optional()
    })
    .strict(),
  z
    .object({
      transient: z.literal(true),
      connectionId: z.string().min(1).max(512),
      clearedAt: timestamp
    })
    .strict()
])
export const AgentStatusStreamFrame = z.union([
  scope.extend({ type: z.literal('ready'), sequence: z.literal(0) }).strict(),
  z
    .object({
      type: z.literal('event'),
      sequence,
      kind: z.literal('set'),
      status: CliAgentStatusRow
    })
    .strict(),
  z
    .object({
      type: z.literal('event'),
      sequence,
      kind: z.literal('clear'),
      clear: AgentStatusClearFrame
    })
    .strict(),
  z.object({ type: z.literal('end'), sequence }).strict(),
  z.object({ type: z.literal('error'), code: z.literal('agent_status_unavailable') }).strict()
])
