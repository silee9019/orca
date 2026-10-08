import { z } from 'zod'
import { BrowserPaletteSelection } from './browser-palette-params'
export const WorkspaceFileOpenCommand = BrowserPaletteSelection.pick({
  executionHostId: true,
  worktreeId: true
})
  .extend({ filePath: z.string().min(1) })
  .strict()
export type WorkspaceFileOpenCommand = z.infer<typeof WorkspaceFileOpenCommand>
export const WorkspaceFileOpenState = WorkspaceFileOpenCommand.extend({
  mode: z.enum(['browser-tab', 'doc-preview']),
  pageId: z.string().min(1),
  workspaceId: z.string().min(1)
})
export type WorkspaceFileOpenState = z.infer<typeof WorkspaceFileOpenState>
