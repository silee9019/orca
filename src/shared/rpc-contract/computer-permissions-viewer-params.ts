import { z } from 'zod'
import { openEnum } from '../zod-salvage'
export const ComputerPermissionsViewerCommand = z.object({ action: z.enum(['status', 'refresh']) })
export type ComputerPermissionsViewerCommand = z.infer<typeof ComputerPermissionsViewerCommand>
export const ComputerPermissionsViewerState = z.object({
  platform: openEnum(
    [
      'aix',
      'android',
      'darwin',
      'freebsd',
      'haiku',
      'linux',
      'openbsd',
      'sunos',
      'win32',
      'cygwin',
      'netbsd'
    ],
    undefined
  )
    .transform((platform) => platform ?? null)
    .nullable(),
  permissions: z
    .array(
      z.object({
        id: z.string().min(1),
        status: openEnum(['granted', 'not-granted', 'unsupported'], 'unsupported')
      })
    )
    .refine(
      (permissions) =>
        new Set(permissions.map((permission) => permission.id)).size === permissions.length
    ),
  loading: z.boolean(),
  helperUnavailable: z.boolean()
})
export type ComputerPermissionsViewerState = z.infer<typeof ComputerPermissionsViewerState>
