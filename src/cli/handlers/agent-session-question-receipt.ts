import { z } from 'zod'
import { AGENT_JOURNAL_RESOLUTION_STATES } from '../../shared/agent-session-journal-types'
import { RuntimeClientError } from '../runtime/types'

const QuestionReceipt = z.object({
  ok: z.literal(true),
  replayed: z.boolean().optional(),
  fence: z.number().optional(),
  cursor: z.object({ epoch: z.string(), sequence: z.number() }).optional(),
  value: z.object({
    itemId: z.string(),
    revision: z.number(),
    resolution: z.object({
      state: z.enum(AGENT_JOURNAL_RESOLUTION_STATES),
      resolvedAt: z.number().nullable().optional()
    })
  })
})

export function agentSessionQuestionReceipt(result: unknown) {
  const receipt = QuestionReceipt.safeParse(result)
  if (!receipt.success) {
    throw new RuntimeClientError(
      'invalid_question_receipt',
      'The execution host returned an invalid question receipt.'
    )
  }
  return receipt.data
}
