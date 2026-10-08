import { z } from 'zod'
import { isSkillInstallProviderId, type SkillInstallProviderId } from './skill-install-providers'

export const SKILL_INSTALL_TARGET_VIEWER_SCHEMAS = [
  z.object({ kind: z.literal('environment'), value: z.string().min(1).max(1024) }).strict(),
  z.object({ kind: z.literal('scope'), value: z.enum(['global', 'workspace']) }).strict(),
  z.object({ kind: z.literal('workspace'), value: z.string().max(8192) }).strict(),
  z
    .object({
      kind: z.literal('execution'),
      value: z
        .object({ kind: z.literal('wsl'), distro: z.string().min(1).max(256) })
        .strict()
        .nullable()
    })
    .strict(),
  z
    .object({
      kind: z.literal('providers'),
      value: z
        .array(
          z.custom<SkillInstallProviderId>(
            (value) => typeof value === 'string' && isSkillInstallProviderId(value)
          )
        )
        .max(32)
    })
    .strict()
] as const
export const SkillInstallTargetViewerActionSchema = z.discriminatedUnion(
  'kind',
  SKILL_INSTALL_TARGET_VIEWER_SCHEMAS
)
export type SkillInstallTargetViewerAction = z.infer<typeof SkillInstallTargetViewerActionSchema>

export const SkillInstallViewerActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('get') }).strict(),
  z.object({ kind: z.literal('link'), value: z.string().max(8192) }).strict(),
  z.object({ kind: z.literal('inspect') }).strict(),
  z.object({ kind: z.literal('install'), discardLocal: z.boolean() }).strict(),
  z.object({ kind: z.literal('cancel') }).strict(),
  ...SKILL_INSTALL_TARGET_VIEWER_SCHEMAS
])
export type SkillInstallViewerAction = z.infer<typeof SkillInstallViewerActionSchema>
