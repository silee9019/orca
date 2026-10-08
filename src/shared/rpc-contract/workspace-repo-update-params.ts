import { z } from 'zod'
import { ExecutionHostId } from './automation-params'
import { createRepoUpdateSchema } from './repo-update-params'
import { normalizeGhAccountBinding } from '../github/account-binding'

const CheckedGhAccount = z
  .unknown()
  .transform((value, ctx) => {
    const binding = normalizeGhAccountBinding(value)
    if (!binding) {
      ctx.addIssue({ code: 'custom', message: 'Invalid account binding.' })
      return z.NEVER
    }
    return binding
  })
  .nullable()
  .optional()

const DesktopRepoUpdates = createRepoUpdateSchema({})
  .shape.updates.extend({
    displayName: z.string().optional(),
    worktreeBaseRef: z.string().optional(),
    worktreeBasePath: z.string().optional(),
    projectGroupId: z.string().nullable().optional(),
    ghAccount: CheckedGhAccount,
    hookSettings: z
      .object({
        mode: z.enum(['auto', 'override']),
        setupRunPolicy: z.enum(['ask', 'run-by-default', 'skip-by-default']).optional(),
        setupAgentStartupPolicy: z.enum(['start-immediately', 'wait-for-setup']).optional(),
        commandSourcePolicy: z.enum(['shared-only', 'local-only', 'run-both']).optional(),
        scripts: z.object({ setup: z.string(), archive: z.string() }).strict()
      })
      .strict()
      .optional()
  })
  .strict()

export const DesktopRepoUpdate = z
  .object({
    repoId: z.string().min(1),
    hostId: ExecutionHostId,
    updates: DesktopRepoUpdates
  })
  .strict()
