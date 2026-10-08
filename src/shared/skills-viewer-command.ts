import { SkillLinksViewerActionSchema } from './skill-links-viewer-command'
import { SkillFreshnessViewerActionSchema } from './skill-freshness-viewer-command'
import { SkillListViewerActionSchema } from './skill-list-viewer-command'
import { SkillShareViewerActionSchema } from './skill-share-viewer-command'
import { ManagedSkillViewerActionSchema } from './managed-skill-viewer-command'
import { SkillBundleViewerActionSchema } from './skill-bundle-viewer-command'
import { SkillInstallViewerActionSchema } from './skill-install-viewer-command'
import { z } from 'zod'
import { isClipboardTextByteLengthOverLimit } from './clipboard-text'
import { MAX_SKILL_DELETE_BATCH } from './skill-delete-contract'

export const SKILLS_FILTER_QUERY_MAX_BYTES = 2 * 1024
export function isSkillsFilterQueryTooLarge(
  query: string,
  maxBytes = SKILLS_FILTER_QUERY_MAX_BYTES
): boolean {
  return isClipboardTextByteLengthOverLimit(query, maxBytes)
}
export const SkillsViewerFilterSchema = z
  .object({
    query: z.string().refine((value) => !isSkillsFilterQueryTooLarge(value)),
    sourceKind: z.enum(['all', 'home', 'repo', 'bundled', 'plugin']),
    agent: z.string().min(1).max(256)
  })
  .strict()
export type SkillsFilterState = z.infer<typeof SkillsViewerFilterSchema>
export const NO_SKILL_FILTERS: SkillsFilterState = { query: '', sourceKind: 'all', agent: 'all' }
export const SkillsDeleteConfirmationSchema = z
  .object({
    kind: z.literal('delete-confirmation'),
    operationId: z.uuid(),
    confirmed: z.boolean()
  })
  .strict()
export const SkillsViewerActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('get') }).strict(),
  z.object({ kind: z.literal('close') }).strict(),
  z.object({ kind: z.literal('delete-selected') }).strict(),
  z.object({ kind: z.literal('delete-result-dismiss') }).strict(),
  SkillsDeleteConfirmationSchema,
  z.object({ kind: z.literal('install-form'), action: SkillInstallViewerActionSchema }).strict(),
  z.object({ kind: z.literal('bundle-form'), action: SkillBundleViewerActionSchema }).strict(),
  z.object({ kind: z.literal('managed-form'), action: ManagedSkillViewerActionSchema }).strict(),
  z.object({ kind: z.literal('share-form'), action: SkillShareViewerActionSchema }).strict(),
  z.object({ kind: z.literal('list-form'), action: SkillListViewerActionSchema }).strict(),
  z.object({ kind: z.literal('links-form'), action: SkillLinksViewerActionSchema }).strict(),
  z
    .object({ kind: z.literal('freshness-form'), action: SkillFreshnessViewerActionSchema })
    .strict(),
  z
    .object({
      kind: z.literal('share'),
      open: z.boolean(),
      ids: z.array(z.string().min(1).max(8192)).min(1).max(MAX_SKILL_DELETE_BATCH).optional()
    })
    .strict(),
  z.object({ kind: z.literal('filter'), value: SkillsViewerFilterSchema }).strict(),
  z.object({ kind: z.literal('filter-clear') }).strict(),
  z.object({ kind: z.literal('view'), value: z.enum(['skills', 'shared']) }).strict(),
  z.object({ kind: z.literal('mode'), value: z.enum(['share', 'delete']).nullable() }).strict(),
  z
    .object({
      kind: z.literal('select'),
      ids: z.array(z.string().min(1).max(8192)).min(1).max(MAX_SKILL_DELETE_BATCH),
      selected: z.boolean()
    })
    .strict(),
  z.object({ kind: z.literal('select-visible') }).strict(),
  z.object({ kind: z.literal('clear-selection') }).strict(),
  z.object({ kind: z.literal('management'), open: z.boolean() }).strict(),
  z
    .object({
      kind: z.literal('install'),
      open: z.boolean(),
      link: z.string().max(8192).optional()
    })
    .strict(),
  z.object({ kind: z.literal('refresh') }).strict()
])
export type SkillsViewerAction = z.infer<typeof SkillsViewerActionSchema>
export const SkillsViewerParams = z
  .object({ viewer: z.literal('desktop'), action: SkillsViewerActionSchema })
  .strict()
