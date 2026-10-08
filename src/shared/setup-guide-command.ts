import { z } from 'zod'
import { openEnum } from './zod-salvage'
import type { SetupGuideCommand } from './rpc-contract/setup-guide-params'
export const SetupGuideResultSchema = z
  .object({
    viewer: z.literal('host'),
    viewerId: z.number().int(),
    applied: z.boolean(),
    source: z.enum(['help_menu', 'sidebar']),
    dialogPresent: z.boolean(),
    contentPresent: z.boolean(),
    stepId: z.string().nullable(),
    sidebarDismissed: z.boolean().optional(),
    changed: z.boolean().optional(),
    writeOutcome: z.literal('unverified').optional(),
    diskPersistence: z.literal('unverified').optional(),
    sidebarEntryPresent: z.boolean().optional(),
    menuPresent: z.boolean().optional(),
    reason: openEnum(
      ['setup_guide_not_rendered', 'viewer_surface_superseded'],
      'setup_guide_not_rendered'
    ).optional()
  })
  .strip()
export type SetupGuideResult = z.infer<typeof SetupGuideResultSchema>
export const SetupGuideHideResultSchema = SetupGuideResultSchema.extend({
  source: z.literal('help_menu'),
  sidebarDismissed: z.boolean(),
  changed: z.boolean(),
  writeOutcome: z.literal('unverified'),
  diskPersistence: z.literal('unverified')
})
export const SetupGuideSidebarHideResultSchema = SetupGuideHideResultSchema.extend({
  source: z.literal('sidebar'),
  sidebarEntryPresent: z.boolean(),
  menuPresent: z.boolean()
})
export type SetupGuideRequest = { id: string; expiresAt: number; command: SetupGuideCommand }
export type SetupGuideResponse = { id: string } & (
  | { ok: true; result: SetupGuideResult }
  | { ok: false; error: string }
)
