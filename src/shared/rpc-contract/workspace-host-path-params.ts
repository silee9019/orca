import { parseExecutionHostId } from '../execution-host'
import { isWindowsAbsolutePathLike } from '../cross-platform-path'
import { z } from 'zod'
import { ExecutionHostId } from './automation-params'

const DesktopMutationHostId = ExecutionHostId.transform((value, ctx) => {
  const host = parseExecutionHostId(value)
  if (!host || host.kind === 'runtime') {
    ctx.addIssue({ code: 'custom', message: 'Choose local or the SSH execution host.' })
    return z.NEVER
  }
  return host.id
})

const DesktopAbsolutePath = z
  .string()
  .min(1)
  .refine(
    (value) => value.startsWith('/') || isWindowsAbsolutePathLike(value),
    'Use an absolute host path.'
  )

const DesktopLocalFileAccess = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('user-file') }).strict(),
  z.object({ kind: z.literal('document-resource'), documentPath: DesktopAbsolutePath }).strict(),
  z.object({ kind: z.literal('chat-image') }).strict(),
  z.object({ kind: z.literal('document-folder'), documentPath: DesktopAbsolutePath }).strict()
])

export const DesktopDirectoryCreate = z
  .object({
    dirPath: DesktopAbsolutePath,
    connectionId: z.string().min(1).optional(),
    expectedExecutionHostId: DesktopMutationHostId,
    expectedSshTargetId: z.string().min(1).optional(),
    expectedSshConnectionGeneration: z.number().int().nonnegative().optional()
  })
  .strict()

export const DesktopHostPathExists = z
  .object({
    filePath: DesktopAbsolutePath,
    connectionId: z.string().min(1).optional(),
    access: DesktopLocalFileAccess.optional()
  })
  .strict()
