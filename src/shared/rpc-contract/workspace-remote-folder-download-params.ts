import { z } from 'zod'
import { isRuntimePathAbsolute } from '../cross-platform-path'
import { isWslUncPath } from '../wsl-paths'
const Desktop = z.object({ expectedExecutionHostId: z.literal('local') })
export const RemoteFolderDownloadStart = Desktop.extend({
  expectedWriteHostId: z.literal('local'),
  connectionId: z.string().min(1).max(256),
  expectedReadHostId: z.string().min(5).max(260),
  dirPath: z.string().min(1).max(4096).refine(isRuntimePathAbsolute),
  destinationPath: z
    .string()
    .min(1)
    .max(4096)
    .refine((path) => isRuntimePathAbsolute(path) && !isWslUncPath(path))
})
  .strict()
  .refine(
    (params) => params.expectedReadHostId === `ssh:${params.connectionId}`,
    'SSH read host mismatch'
  )
export const RemoteFolderDownloadRequest = Desktop.extend({ requestId: z.string().uuid() }).strict()
