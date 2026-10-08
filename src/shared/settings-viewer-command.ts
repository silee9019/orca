import { z } from 'zod'
import { openEnum } from './zod-salvage'
import type { SettingsViewerCommand } from './rpc-contract/settings-viewer-params'

export const SettingsViewerResultSchema = z
  .object({
    viewer: z.literal('host'),
    viewerId: z.number().int(),
    applied: z.boolean(),
    activeSectionId: z.string().nullable(),
    resolvedSectionId: z.string().nullable(),
    queryInput: z.string(),
    queryApplied: z.string(),
    visibleSectionIds: z.array(z.string()),
    renderedSectionIds: z.array(z.string()),
    sectionTargetPresent: z.boolean(),
    reason: openEnum(
      ['viewer_not_applied', 'viewer_runtime_changed', 'settings_target_not_rendered'],
      'viewer_not_applied'
    ).optional()
  })
  .strip()
export type SettingsViewerResult = z.infer<typeof SettingsViewerResultSchema>
export type SettingsViewerRequest = {
  id: string
  expiresAt: number
  command: SettingsViewerCommand
}
export type SettingsViewerResponse = { id: string } & (
  | { ok: true; result: SettingsViewerResult }
  | { ok: false; error: string }
)
