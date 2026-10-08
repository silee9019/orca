import { z } from 'zod'

export const BrowserPreference = z.discriminatedUnion('field', [
  z.object({ field: z.literal('link-routing'), value: z.boolean() }),
  z.object({ field: z.literal('link-routing-modifier'), value: z.boolean() }),
  z.object({ field: z.literal('localhost-labels'), value: z.boolean() }),
  z.object({ field: z.literal('client-hosted-remote'), value: z.boolean() }),
  z.object({ field: z.literal('ssh-routing'), value: z.boolean() }),
  z.object({ field: z.literal('terminal-url-click'), value: z.enum(['actions', 'open', 'none']) }),
  z.object({
    field: z.literal('terminal-url-middle-click'),
    value: z.enum(['actions', 'open', 'none'])
  })
])
