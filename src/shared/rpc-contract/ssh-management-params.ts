import { z } from 'zod'

const port = z.number().int().min(1).max(65535)
const targetFields = {
  label: z.string().min(1),
  host: z.string().min(1),
  username: z.string().min(1),
  port,
  configHost: z.string().min(1).optional(),
  identityFile: z.string().min(1).optional(),
  identityAgent: z.string().min(1).optional(),
  identitiesOnly: z.boolean().optional(),
  gssapiAuthentication: z.boolean().optional(),
  proxyCommand: z.string().min(1).optional(),
  jumpHost: z.string().min(1).optional(),
  relayGracePeriodSeconds: z
    .number()
    .int()
    .refine((value) => value === 0 || (value >= 60 && value <= 604800))
    .optional(),
  systemSshConnectionReuse: z.boolean().optional(),
  remoteRuntime: z.enum(['legacy', 'pinned-node']).optional()
}
export const SshManagedTarget = z.object({ targetId: z.string().min(1) }).strict()
export const SshManagedDestructiveTarget = z
  .object({
    targetId: z.string().min(1),
    confirmTarget: z.string().min(1)
  })
  .strict()
  .refine((value) => value.targetId === value.confirmTarget, { message: 'confirm_target_mismatch' })
export const SshManagedAddTarget = z.object({ target: z.object(targetFields).strict() }).strict()
export const SshManagedUpdateTarget = z
  .object({
    id: z.string().min(1),
    updates: z.object(targetFields).partial().strict()
  })
  .strict()
export const SshManagedImportConfig = z.object({ reAdopt: z.boolean().optional() }).strict()
export const SshManagedConfigQuery = z
  .object({ query: z.string().optional(), refresh: z.boolean().optional() })
  .strict()
export const SshManagedConfigAlias = z.object({ alias: z.string().min(1) }).strict()
const forwardFields = {
  targetId: z.string().min(1),
  localPort: port,
  remoteHost: z.string().min(1),
  remotePort: port,
  label: z.string().optional()
}
export const SshManagedAddForward = z.object(forwardFields).strict()
export const SshManagedUpdateForward = z
  .object({ id: z.string().min(1), ...forwardFields })
  .strict()
export const SshManagedRemoveForward = z
  .object({ id: z.string().min(1), targetId: z.string().min(1), confirmTarget: z.string().min(1) })
  .strict()
  .refine((value) => value.targetId === value.confirmTarget, { message: 'confirm_target_mismatch' })
export const SshManagedCredential = z
  .object({ requestId: z.string().min(1), value: z.string().max(65536).nullable() })
  .strict()

export const SshManagedBrowse = z
  .object({ targetId: z.string().min(1), dirPath: z.string().min(1).max(32768) })
  .strict()
