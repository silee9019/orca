import { z } from 'zod'
export const DesktopRepoCreateRemote = z
  .object({
    connectionId: z.string().min(1).max(1000),
    parentPath: z.string().trim().min(1).max(8192),
    name: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .regex(/^[^\\/]+$/)
      .refine((name) => name !== '.' && name !== '..'),
    kind: z.enum(['git', 'folder']),
    expectedExecutionHostId: z.literal('local')
  })
  .strict()
