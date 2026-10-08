import { isValidAgentStatusDropTabId } from '../terminal-tab-id'
import {
  AGENT_STATUS_MAX_FIELD_LENGTH,
  AGENT_TYPE_MAX_LENGTH
} from '../agent-status-field-normalization'
import { z } from 'zod'
import { parsePaneKey } from '../stable-pane-id'

export const AgentStatusListParams = z.object({}).strict()
export const AgentStatusDismissParams = z
  .object({
    paneKey: z
      .string()
      .max(512)
      .refine((value) => parsePaneKey(value) !== null, 'Invalid pane key'),
    receivedAt: z.number().finite().nonnegative(),
    stateStartedAt: z.number().finite().nonnegative()
  })
  .strict()

const AgentStatusInferenceBaseline = z.object({
  paneKey: AgentStatusDismissParams.shape.paneKey,
  baselineUpdatedAt: z.number().finite().nonnegative(),
  baselineStateStartedAt: z.number().finite().nonnegative(),
  baselinePrompt: z.string().max(AGENT_STATUS_MAX_FIELD_LENGTH),
  baselineAgentType: z.string().min(1).max(AGENT_TYPE_MAX_LENGTH).optional()
})
export const AgentStatusQuestionAnsweredParams = AgentStatusInferenceBaseline.strict()
export const AgentStatusInterruptParams = AgentStatusInferenceBaseline.extend({
  intent: z.enum(['plain-escape', 'ctrl-c']),
  inputCount: z.number().int().positive().optional()
}).strict()

export const AgentStatusRetireTabParams = z
  .object({
    tabId: z.string().refine(isValidAgentStatusDropTabId, 'Invalid tab ID'),
    confirm: z.literal(true),
    observedRows: z.array(AgentStatusDismissParams.extend({ paneKey: z.string().min(1).max(512) }))
  })
  .strict()
