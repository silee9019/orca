import { z } from 'zod'
import { AI_VAULT_AGENTS } from '../ai-vault-types'

export const AppVaultFirstPromptParams = z
  .object({
    agent: z.enum(AI_VAULT_AGENTS),
    filePath: z.string().min(1).max(32768),
    sessionId: z.string().min(1).max(512).optional(),
    codexHome: z.string().max(32768).nullable().optional()
  })
  .strict()
