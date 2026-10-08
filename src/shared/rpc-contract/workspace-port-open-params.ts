import { z } from 'zod'
import { BrowserPaletteSelection } from './browser-palette-params'
export const WorkspacePortOpenCommand = BrowserPaletteSelection.pick({
  executionHostId: true,
  worktreeId: true
})
  .extend({ portId: z.string().min(1), intent: z.enum(['saved', 'system']) })
  .strict()
export type WorkspacePortOpenCommand = z.infer<typeof WorkspacePortOpenCommand>
export const WorkspacePortOpenState = WorkspacePortOpenCommand.extend({
  destination: z.enum(['browser', 'system']),
  pageId: z.string().optional(),
  workspaceId: z.string().optional(),
  remotePageId: z.string().optional()
})
export type WorkspacePortOpenState = z.infer<typeof WorkspacePortOpenState>
