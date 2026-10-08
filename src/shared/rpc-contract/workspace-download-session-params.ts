import { z } from 'zod'
import { isRuntimePathAbsolute } from '../cross-platform-path'
import { isWslUncPath } from '../wsl-paths'
const Desktop = z.object({ expectedExecutionHostId: z.literal('local') })
export const DesktopDownloadSessionStart = Desktop.extend({
  expectedWriteHostId: z.literal('local'),
  destinationPath: z
    .string()
    .min(1)
    .max(4096)
    .refine((path) => isRuntimePathAbsolute(path) && !isWslUncPath(path)),
  overwrite: z.boolean().default(false)
}).strict()
export const DesktopDownloadSessionRequest = Desktop.extend({
  requestId: z.string().uuid()
}).strict()
export const DesktopDownloadSessionAppend = DesktopDownloadSessionRequest.extend({
  expectedByteOffset: z
    .number()
    .int()
    .min(0)
    .max(64 * 1024 * 1024),
  contentBase64: z
    .string()
    .min(4)
    .max(1398104)
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)
    .refine((value) => {
      const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
      return (value.length / 4) * 3 - padding <= 1024 * 1024
    })
}).strict()

export const DesktopSaveDownloadedFile = DesktopDownloadSessionStart.extend({
  content: z.string().max(1024 * 1024),
  encoding: z.enum(['utf8', 'base64']).default('utf8')
})
  .strict()
  .refine(
    (value) =>
      value.encoding !== 'base64' ||
      /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.content),
    'Invalid base64 content'
  )
export const DesktopSaveDownloadedResult = z
  .object({
    requestId: z.string().uuid(),
    state: z.enum([
      'pending',
      'open',
      'finishing',
      'cancel_requested',
      'finished',
      'cancelled',
      'failed'
    ]),
    byteOffset: z.number().int().nonnegative(),
    cleanupPending: z.boolean()
  })
  .strict()
