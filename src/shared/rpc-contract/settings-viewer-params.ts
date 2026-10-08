import { z } from 'zod'
import { parseExecutionHostId } from '../execution-host'

const open = z
  .object({
    viewer: z.literal('host'),
    operation: z.literal('open'),
    pane: z.string().min(1).max(128),
    repoId: z.string().min(1).max(2048).optional(),
    hostId: z
      .string()
      .refine((value) => parseExecutionHostId(value) !== null)
      .optional(),
    sectionId: z.string().min(1).max(256).optional()
  })
  .strict()
  .refine(
    (value) =>
      value.pane === 'repo'
        ? value.repoId !== undefined
        : value.repoId === undefined && value.hostId === undefined,
    'Repository targets require --repo; other panes do not accept --repo or --host'
  )

export const SettingsViewerParams = z.union([
  open,
  z
    .object({
      viewer: z.literal('host'),
      operation: z.literal('search'),
      query: z.string().max(2048)
    })
    .strict()
])
export type SettingsViewerCommand = z.infer<typeof SettingsViewerParams>
