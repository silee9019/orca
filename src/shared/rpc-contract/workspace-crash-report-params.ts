import { z } from 'zod'

export const WorkspaceCrashReportDismiss = z.object({ reportId: z.string().min(1) }).strict()

export const WorkspaceCrashReportCopy = z
  .object({
    reportId: z.string().min(1).optional(),
    notes: z.string().optional(),
    submissionFailure: z
      .object({
        error: z.string(),
        diagnosticContext: z
          .discriminatedUnion('status', [
            z.object({ status: z.literal('uploaded'), ticketId: z.string() }).strict(),
            z.object({ status: z.literal('not_uploaded'), reason: z.string() }).strict()
          ])
          .optional()
      })
      .strict()
      .optional()
  })
  .strict()

export const WorkspaceCrashReportSubmit = z
  .object({
    reportId: z.string().min(1).optional(),
    notes: z.string().optional(),
    includeDiagnosticLogs: z.boolean(),
    submitAnonymously: z.boolean(),
    githubLogin: z.string().nullable(),
    githubEmail: z.string().nullable()
  })
  .strict()
