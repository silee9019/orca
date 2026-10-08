import { z } from 'zod'
import { SKILL_INSTALL_TARGET_VIEWER_SCHEMAS } from './skill-install-viewer-command'

export const SkillBundleViewerActionSchema = z.discriminatedUnion('kind', [
  ...SKILL_INSTALL_TARGET_VIEWER_SCHEMAS,
  z.object({ kind: z.literal('get') }).strict(),
  z
    .object({ kind: z.literal('select'), id: z.string().min(1).max(8192), selected: z.boolean() })
    .strict(),
  z.object({ kind: z.literal('select-all'), selected: z.boolean() }).strict(),
  z
    .object({ kind: z.literal('replace'), id: z.string().min(1).max(8192), replace: z.boolean() })
    .strict(),
  z.object({ kind: z.literal('install') }).strict(),
  z.object({ kind: z.literal('retry') }).strict(),
  z.object({ kind: z.literal('cancel') }).strict(),
  z.object({ kind: z.literal('close') }).strict()
])
export type SkillBundleViewerAction = z.infer<typeof SkillBundleViewerActionSchema>
