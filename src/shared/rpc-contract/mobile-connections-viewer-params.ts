import { z } from 'zod'
const viewer = { viewerId: z.number().int().positive() }
export const MobileConnectionsViewerParams = z.discriminatedUnion('operation', [
  z
    .object({
      ...viewer,
      operation: z.literal('mobile.revoke-device'),
      confirmDevice: z.string().min(1)
    })
    .strict(),
  z.object({ ...viewer, operation: z.literal('mobile.get') }).strict(),
  z
    .object({
      ...viewer,
      operation: z.literal('mobile.platform'),
      value: z.enum(['ios', 'android'])
    })
    .strict(),
  z
    .object({
      ...viewer,
      operation: z.literal('mobile.ios-channel'),
      value: z.enum(['stable', 'preview'])
    })
    .strict(),
  z
    .object({
      ...viewer,
      operation: z.literal('mobile.connection-mode'),
      value: z.enum(['automatic', 'local-only'])
    })
    .strict(),
  z
    .object({
      ...viewer,
      operation: z.enum(['mobile.address', 'mobile.custom-add', 'mobile.custom-remove']),
      value: z.string().min(1).max(253)
    })
    .strict(),
  z
    .object({
      ...viewer,
      operation: z.enum([
        'mobile.start',
        'mobile.back',
        'mobile.continue',
        'mobile.done',
        'mobile.pair-another',
        'mobile.use-lan',
        'mobile.generate',
        'mobile.retry-relay',
        'mobile.copy-pairing',
        'mobile.copy-install',
        'mobile.open-install',
        'mobile.open-android-guide',
        'mobile.copy-diagnostics',
        'mobile.refresh-network',
        'mobile.close',
        'mobile.sidebar-toggle'
      ])
    })
    .strict()
])
