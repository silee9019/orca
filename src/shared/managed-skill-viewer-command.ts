import { z } from 'zod'

export const ManagedSkillViewerActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('get') }).strict(),
  z.object({ kind: z.literal('environment'), value: z.string().min(1).max(256) }).strict(),
  z.object({ kind: z.literal('select'), key: z.string().min(1).max(8192).nullable() }).strict(),
  z.object({ kind: z.literal('version'), value: z.string().min(1).max(256) }).strict(),
  z.object({ kind: z.literal('refresh') }).strict(),
  z.object({ kind: z.literal('install'), discardLocal: z.boolean() }).strict(),
  z.object({ kind: z.literal('remove'), discardLocal: z.boolean() }).strict(),
  z.object({ kind: z.literal('cancel') }).strict(),
  z.object({ kind: z.literal('send-to-machine') }).strict(),
  z.object({ kind: z.literal('close') }).strict()
])
export type ManagedSkillViewerAction = z.infer<typeof ManagedSkillViewerActionSchema>
