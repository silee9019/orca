import { z } from 'zod'
const target = {
  viewerId: z.number().int().positive(),
  requestId: z.string().min(1),
  targetId: z.string().min(1)
}
export const SshCredentialViewerParams = z.discriminatedUnion('operation', [
  z.object({ ...target, operation: z.literal('ssh-credential.get') }).strict(),
  z
    .object({
      ...target,
      operation: z.literal('ssh-credential.draft'),
      value: z.string().max(65536)
    })
    .strict(),
  z
    .object({
      ...target,
      operation: z.literal('ssh-credential.submit'),
      value: z.string().max(65536),
      confirmTarget: z.string().min(1)
    })
    .strict(),
  z
    .object({
      ...target,
      operation: z.literal('ssh-credential.cancel'),
      confirmTarget: z.string().min(1)
    })
    .strict()
])
export const SshCredentialViewerResultSchema = z
  .object({
    viewerId: z.number().int().positive(),
    persisted: z.null(),
    applied: z.boolean(),
    state: z.object({ open: z.boolean(), configured: z.boolean(), busy: z.boolean() }).strict()
  })
  .strict()
