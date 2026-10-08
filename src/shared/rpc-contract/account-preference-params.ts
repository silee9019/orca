import { z } from 'zod'

export const AccountPreferenceKey = z.enum([
  'localAccountRuntime',
  'localAccountWslDistro',
  'minimaxEndpoint',
  'zcodePlanSite',
  'opencodeWorkspaceId'
])
export const AccountPreferenceParams = z.discriminatedUnion('action', [
  z.object({ action: z.literal('status') }).strict(),
  z
    .object({ action: z.literal('set'), key: AccountPreferenceKey, value: z.string().max(4096) })
    .strict()
])
export type AccountPreferenceOperation = z.infer<typeof AccountPreferenceParams>
