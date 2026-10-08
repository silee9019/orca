import { z } from 'zod'
import { openEnum } from './zod-salvage'
import type { SetupGuideCommand } from './rpc-contract/setup-guide-params'
export const SetupGuideResultSchema = z
  .object({
    viewer: z.literal('host'),
    viewerId: z.number().int(),
    applied: z.boolean(),
    source: z.literal('help_menu'),
    dialogPresent: z.boolean(),
    contentPresent: z.boolean(),
    stepId: z.string().nullable(),
    reason: openEnum(
      ['setup_guide_not_rendered', 'viewer_surface_superseded'],
      'setup_guide_not_rendered'
    ).optional()
  })
  .strip()
export type SetupGuideResult = z.infer<typeof SetupGuideResultSchema>
export type SetupGuideRequest = { id: string; expiresAt: number; command: SetupGuideCommand }
export type SetupGuideResponse = { id: string } & (
  | { ok: true; result: SetupGuideResult }
  | { ok: false; error: string }
)
