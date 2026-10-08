import { z } from 'zod'
import {
  DesktopAbsolutePath,
  DesktopLocalFileAccess,
  DesktopMutationHostId
} from './workspace-host-path-params'
const SshExpectation = {
  connectionId: z.string().min(1).optional(),
  expectedExecutionHostId: DesktopMutationHostId,
  expectedSshTargetId: z.string().min(1).optional(),
  expectedSshConnectionGeneration: z.number().int().nonnegative().optional()
}
export const DesktopExternalPathImport = z
  .object({
    sourcePaths: z.array(DesktopAbsolutePath).min(1).max(100),
    destDir: DesktopAbsolutePath,
    ensureDir: z.boolean().optional(),
    access: DesktopLocalFileAccess.optional(),
    ...SshExpectation
  })
  .strict()
export const DesktopDroppedPathsResolve = z
  .object({
    paths: z.array(DesktopAbsolutePath).min(1).max(100),
    worktreePath: DesktopAbsolutePath,
    ...SshExpectation
  })
  .strict()
