import { z } from 'zod'
import { isRuntimePathAbsolute } from '../cross-platform-path'
import { isWslUncPath } from '../wsl-paths'
const Desktop = z.object({ expectedExecutionHostId: z.literal('local') })
export const DesktopLogTailStart = Desktop.extend({
  expectedReadHostId: z.literal('local'),
  filePath: z
    .string()
    .trim()
    .min(1)
    .max(4096)
    .refine((path) => isRuntimePathAbsolute(path) && !isWslUncPath(path))
}).strict()
export const DesktopLogTailRead = DesktopLogTailStart.extend({
  fromByteOffset: z.number().int().nonnegative().default(0),
  expectedIdentity: z.string().min(1).max(512).optional()
}).strict()
export const DesktopLogTailRequest = Desktop.extend({ requestId: z.string().uuid() }).strict()
