import { z } from 'zod'
const viewer = { viewerId: z.number().int().positive(), surface: z.enum(['settings', 'sidebar']) }
export const MobileNavigationViewerParams = z.discriminatedUnion('operation', [
  z
    .object({
      ...viewer,
      operation: z.enum(['mobile-navigation.get', 'mobile-navigation.dismiss-badge'])
    })
    .strict(),
  z
    .object({ ...viewer, operation: z.literal('mobile-navigation.visibility'), shown: z.boolean() })
    .strict(),
  z
    .object({
      ...viewer,
      operation: z.literal('mobile-navigation.open-install'),
      platform: z.enum(['ios', 'android'])
    })
    .strict()
])
export const MobileNavigationViewerResultSchema = z
  .object({
    viewerId: z.number().int().positive(),
    applied: z.boolean(),
    persisted: z.boolean().nullable(),
    state: z.object({ showButton: z.boolean(), badgeVisible: z.boolean() }).strict()
  })
  .strict()
export type MobileNavigationViewerState = z.infer<
  typeof MobileNavigationViewerResultSchema
>['state']
export type MobileNavigationViewerResult = z.infer<typeof MobileNavigationViewerResultSchema>
