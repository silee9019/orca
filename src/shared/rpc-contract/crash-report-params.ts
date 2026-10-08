import { z } from 'zod'
export const CrashReportParams = z
  .object({ viewer: z.literal('host'), operation: z.literal('open') })
  .strict()
export type CrashReportCommand = z.infer<typeof CrashReportParams>
