import { z } from 'zod'
import { isRuntimePathAbsolute } from '../cross-platform-path'
import { isWslUncPath } from '../wsl-paths'
const Desktop = z.object({ expectedExecutionHostId: z.literal('local') })
const NativePath = z
  .string()
  .trim()
  .min(1)
  .max(4096)
  .refine(
    (path) =>
      (isRuntimePathAbsolute(path, 'posix') || isRuntimePathAbsolute(path, 'windows')) &&
      !isWslUncPath(path),
    {
      message: 'An absolute native host path is required.'
    }
  )
export const DesktopNotebookKernelStart = Desktop.extend({
  expectedKernelHostId: z.literal('local'),
  filePath: NativePath,
  python: NativePath
}).strict()
export const DesktopNotebookKernelRequest = Desktop.extend({
  requestId: z.string().uuid()
}).strict()
export const DesktopNotebookKernelExecute = DesktopNotebookKernelRequest.extend({
  code: z
    .string()
    .min(1)
    .max(1024 * 1024)
    .refine((code) => new TextEncoder().encode(code).byteLength <= 1024 * 1024)
}).strict()
export const DesktopNotebookKernelFrames = DesktopNotebookKernelRequest.extend({
  afterSequence: z.number().int().nonnegative().default(0),
  limit: z.number().int().min(1).max(100).default(100)
}).strict()
export function getDesktopNotebookKernelConfirmation(
  params: z.infer<typeof DesktopNotebookKernelStart>
): string {
  return `${params.expectedKernelHostId}:${params.filePath}:${params.python}`
}
