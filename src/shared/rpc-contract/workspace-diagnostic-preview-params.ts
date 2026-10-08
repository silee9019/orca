import { z } from 'zod'

export const DesktopDiagnosticPreviewOpen = z
  .object({
    bundleSubmissionId: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
    expectedExecutionHostId: z.literal('local')
  })
  .strict()
