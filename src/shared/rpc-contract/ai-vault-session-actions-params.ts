import { z } from 'zod'
import { AI_VAULT_DELETABLE_AGENTS } from '../ai-vault-session-deletion'

export const AiVaultDeleteSessionParams = z
  .object({
    agent: z.enum(AI_VAULT_DELETABLE_AGENTS),
    filePath: z.string().min(1).max(32_768),
    sessionId: z.string().min(1).max(512).optional()
  })
  .strict()

export const AiVaultSubagentSessionsParams = z
  .object({
    agent: z.enum(['claude', 'omp']),
    parentFilePath: z.string().min(1).max(32_768)
  })
  .strict()
