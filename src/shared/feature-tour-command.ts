import { z } from 'zod'
import { openEnum } from './zod-salvage'
import type { FeatureTourCommand } from './rpc-contract/feature-tour-params'
export const FeatureTourResultSchema = z
  .object({
    viewer: z.literal('host'),
    viewerId: z.number().int(),
    applied: z.boolean(),
    source: z.literal('help_menu'),
    dialogPresent: z.boolean(),
    contentPresent: z.boolean(),
    workflowId: z.string().nullable(),
    reason: openEnum(
      ['feature_tour_not_rendered', 'viewer_surface_superseded'],
      'feature_tour_not_rendered'
    ).optional()
  })
  .strip()
export type FeatureTourResult = z.infer<typeof FeatureTourResultSchema>
export type FeatureTourRequest = { id: string; expiresAt: number; command: FeatureTourCommand }
export type FeatureTourResponse = { id: string } & (
  | { ok: true; result: FeatureTourResult }
  | { ok: false; error: string }
)
