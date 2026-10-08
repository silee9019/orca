import { z } from 'zod'

export const AccountCredentialProvider = z.enum([
  'minimax-cookie',
  'minimax-api-key',
  'opencode-go',
  'zcode-plan',
  'bitbucket'
])
export const BitbucketCredentialInput = z.discriminatedUnion('authMode', [
  z
    .object({
      authMode: z.literal('token'),
      accessToken: z.string().trim().min(1),
      baseUrl: z.string().trim().url().optional()
    })
    .strict(),
  z
    .object({
      authMode: z.literal('basic'),
      email: z.string().trim().email(),
      apiToken: z.string().trim().min(1),
      baseUrl: z.string().trim().url().optional()
    })
    .strict()
])
export const AccountCredentialStatusParams = z
  .object({ provider: AccountCredentialProvider })
  .strict()
export const AccountCredentialSaveParams = AccountCredentialStatusParams.extend({
  secret: z.string().trim().min(1).max(65536)
})
export type AccountCredentialOperation = z.infer<typeof AccountCredentialStatusParams> &
  ({ action: 'status' | 'clear' } | { action: 'save'; secret: string })
