import { z } from 'zod'
import { openEnum } from './zod-salvage'
import type { CrashReportCommand } from './rpc-contract/crash-report-params'
export const CrashReportResultSchema = z
  .object({
    viewer: z.literal('host'),
    viewerId: z.number().int(),
    applied: z.boolean(),
    source: z.literal('help_menu'),
    dialogPresent: z.boolean(),
    contentPresent: z.boolean(),
    contentState: openEnum(['loading', 'empty', 'report', 'unknown'], 'unknown').nullable(),
    reason: openEnum(
      ['crash_report_not_rendered', 'viewer_surface_superseded'],
      'crash_report_not_rendered'
    ).optional()
  })
  .strip()
export type CrashReportResult = z.infer<typeof CrashReportResultSchema>
export type CrashReportRequest = { id: string; expiresAt: number; command: CrashReportCommand }
export type CrashReportResponse = { id: string } & (
  | { ok: true; result: CrashReportResult }
  | { ok: false; error: string }
)
