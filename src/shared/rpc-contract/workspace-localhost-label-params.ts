import { z } from 'zod'
export const DesktopLocalhostLabel = z
  .object({
    targetUrl: z
      .string()
      .min(1)
      .max(8192)
      .refine((value) => {
        try {
          const url = new URL(value)
          return (
            url.protocol === 'http:' && !url.username && !url.password && !url.search && !url.hash
          )
        } catch {
          return false
        }
      }, 'Requires an HTTP URL without credentials, query or fragment.'),
    projectName: z.string().trim().min(1).max(1000),
    worktreeName: z.string().trim().min(1).max(1000),
    repoId: z.string().max(1000).nullable().optional(),
    worktreeId: z.string().max(8192).nullable().optional(),
    expectedExecutionHostId: z.literal('local')
  })
  .strict()
