import { z } from 'zod'
const RepoAddOptions = {
  kind: z.enum(['git', 'folder']).optional(),
  displayName: z.string().max(1000).optional(),
  expectedExecutionHostId: z.literal('local')
}
export const DesktopRepoAddLocal = z
  .object({ ...RepoAddOptions, path: z.string().min(1).max(8192) })
  .strict()
export const DesktopRepoAddRemote = z
  .object({
    ...RepoAddOptions,
    connectionId: z.string().min(1).max(1000),
    remotePath: z.string().min(1).max(8192)
  })
  .strict()
