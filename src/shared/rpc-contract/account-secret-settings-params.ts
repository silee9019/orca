import { z } from 'zod'

export const AccountSecretSettingKey = z.enum([
  'agentDefaultEnv',
  'httpProxyUrl',
  'httpProxyBypassRules',
  'opencodeSessionCookie'
])
export const AccountSecretSettingParams = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('set'),
      key: AccountSecretSettingKey,
      input: z.string().max(65536)
    })
    .strict(),
  z.object({ action: z.literal('clear'), key: AccountSecretSettingKey }).strict()
])
export type AccountSecretSettingOperation = z.infer<typeof AccountSecretSettingParams>
