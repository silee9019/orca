import { z } from 'zod'

export const AppTargetParams = z.object({ confirmTarget: z.string().min(1) }).strict()
export const DesktopUpdateCheckParams = z
  .object({
    channel: z.enum(['stable', 'rc', 'hourly', 'daily', 'adhoc']).optional(),
    targetTag: z.string().min(1).optional(),
    includePrerelease: z.boolean().optional(),
    includePerfPrerelease: z.boolean().optional(),
    localBuild: z.boolean().optional()
  })
  .strict()
export const DesktopUpdateBuildsParams = z
  .object({
    channel: z.enum(['stable', 'rc', 'hourly', 'daily', 'adhoc']),
    force: z.boolean().optional()
  })
  .strict()
export const DesktopCliDistroParams = z.object({ distro: z.string().trim().min(1) }).strict()
export const DesktopCliMutationParams = AppTargetParams.extend({
  distro: z.string().trim().min(1).optional()
}).strict()

export const DesktopTelemetryOptInParams = z.object({ optedIn: z.boolean() }).strict()
export const DesktopTelemetryEventParams = z
  .object({ name: z.string().min(1).max(128), props: z.record(z.string(), z.unknown()).optional() })
  .strict()
export const DesktopOnboardingUpdateParams = z
  .object({
    flowVersion: z.number().int().optional(),
    closedAt: z.number().nullable().optional(),
    outcome: z.enum(['completed', 'dismissed']).nullable().optional(),
    lastCompletedStep: z.number().int().optional(),
    checklist: z
      .object({
        addedRepo: z.boolean().optional(),
        choseAgent: z.boolean().optional(),
        ranFirstAgent: z.boolean().optional(),
        ranSecondAgentOnSameTask: z.boolean().optional(),
        triedCmdJ: z.boolean().optional(),
        shapedSidebar: z.boolean().optional(),
        reviewedDiff: z.boolean().optional(),
        openedPr: z.boolean().optional(),
        addedFolder: z.boolean().optional(),
        openedFile: z.boolean().optional(),
        ranAgentOnFile: z.boolean().optional(),
        dismissed: z.boolean().optional()
      })
      .strict()
      .optional()
  })
  .strict()

export const DesktopDiagnosticCollectParams = z
  .object({ lookbackMinutes: z.number().int().min(1).max(43200).optional() })
  .strict()
export const DesktopDiagnosticBundleParams = z
  .object({ bundleSubmissionId: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/) })
  .strict()
export const DesktopDiagnosticUploadParams = DesktopDiagnosticBundleParams.extend({
  confirmSubmissionId: z.string().min(1)
}).strict()
export const DesktopDiagnosticDeleteParams = z
  .object({
    ticketId: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
    confirmTicketId: z.string().min(1)
  })
  .strict()

export const DesktopPetImportParams = z
  .object({ path: z.string().min(1), kind: z.enum(['image', 'bundle']) })
  .strict()
export const DesktopPetFileParams = z
  .object({
    id: z.string().uuid(),
    fileName: z
      .string()
      .min(1)
      .regex(/^[^/\\]+$/),
    kind: z.enum(['image', 'bundle']).optional()
  })
  .strict()
export const DesktopPetDeleteParams = DesktopPetFileParams.extend({
  confirmId: z.string().uuid()
}).strict()
export const DesktopDockBadgeParams = z
  .object({ count: z.number().int().min(0).max(999999) })
  .strict()

export const DesktopStarPromptParams = z
  .object({
    action: z.enum([
      'status',
      'dismiss',
      'later',
      'disable',
      'complete',
      'open-web',
      'star',
      'show'
    ]),
    viewer: z.number().int().positive().optional(),
    confirmTarget: z.string().min(1).optional()
  })
  .strict()

export const DesktopShellUrlParams = z
  .object({ url: z.url().refine((url) => ['http:', 'https:'].includes(new URL(url).protocol)) })
  .strict()
export const DesktopShellPathParams = z.object({ path: z.string().min(1).max(32768) }).strict()
export const DesktopSelectPathParams = DesktopShellPathParams.extend({
  kind: z.enum([
    'directory',
    'image',
    'audio',
    'attachment',
    'floating-markdown',
    'floating-directory'
  ])
}).strict()

export const DesktopPetPreferencesParams = z
  .object({
    visible: z.boolean().optional(),
    id: z.string().min(1).optional(),
    size: z.number().finite().optional()
  })
  .strict()
export const DesktopPetRemoveParams = z
  .object({ id: z.string().uuid(), confirmId: z.string().uuid() })
  .strict()
