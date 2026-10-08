import { z } from 'zod'
const viewer = z.literal('host')
export const SidebarViewerParams = z.union([
  z.object({ viewer, operation: z.literal('get') }).strict(),
  z.object({ viewer, operation: z.literal('toggle'), side: z.enum(['left', 'right']) }).strict(),
  z
    .object({
      viewer,
      operation: z.literal('open-panel'),
      panel: z.enum(['files', 'search', 'source-control', 'checks', 'ports'])
    })
    .strict()
])
export type SidebarViewerCommand = z.infer<typeof SidebarViewerParams>
