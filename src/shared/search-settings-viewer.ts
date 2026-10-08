import { z } from 'zod'
import { parseExecutionHostId } from './execution-host'

const viewer = z.literal('host')
const executionHostId = z
  .string()
  .max(1024)
  .refine((value) => {
    const parsed = parseExecutionHostId(value)
    return parsed?.kind === 'runtime' && parsed.id === value
  })
export const SearchSettingsViewerParams = z
  .discriminatedUnion('operation', [
    z.object({ viewer, operation: z.literal('local-toggle'), confirmation: z.literal('local') }),
    z.object({
      viewer,
      operation: z.literal('enable-all'),
      confirmation: z.literal('all-computers')
    }),
    z.object({ viewer, operation: z.literal('list-toggle') }),
    z.object({ viewer, operation: z.literal('server-settings-open'), executionHostId }),
    z.object({
      viewer,
      operation: z.literal('server-toggle'),
      executionHostId,
      confirmation: executionHostId
    })
  ])
  .refine(
    (command) =>
      command.operation !== 'server-toggle' || command.confirmation === command.executionHostId,
    'Confirmation must match the execution host'
  )
export type SearchSettingsViewerCommand = z.infer<typeof SearchSettingsViewerParams>
export const SearchSettingsViewerResultSchema = z.object({
  viewer: z.literal('host'),
  viewerId: z.number().int(),
  applied: z.boolean(),
  persisted: z.boolean(),
  enabled: z.boolean().optional(),
  expanded: z.boolean().optional(),
  reason: z.string().optional()
})
export type SearchSettingsViewerResult = z.infer<typeof SearchSettingsViewerResultSchema>
export type SearchSettingsViewerRequest = {
  id: string
  command: SearchSettingsViewerCommand
  expiresAt: number
}
export type SearchSettingsViewerResponse = { id: string } & (
  | { ok: true; result: SearchSettingsViewerResult }
  | { ok: false; error: string }
)
