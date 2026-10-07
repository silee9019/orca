import { z } from 'zod'

export const BrowserDocumentCommand = z.discriminatedUnion('action', [
  z.object({
    action: z.enum([
      'status',
      'reload',
      'hard-reload',
      'copy-path',
      'copy-relative-path',
      'open-source',
      'open-external',
      'directory-dismiss'
    ])
  }),
  z.object({
    action: z.literal('directory-allow'),
    paths: z.array(z.string().min(1).max(8192)).min(1).max(32),
    confirmation: z.string().min(1).max(1024)
  })
])
export type BrowserDocumentCommand = z.infer<typeof BrowserDocumentCommand>

export const BrowserDocumentState = z.object({
  page: z.string().min(1),
  worktreeId: z.string().min(1),
  phase: z.enum(['loading', 'ready', 'unavailable']),
  grantReady: z.boolean(),
  pendingPaths: z.array(z.string().max(8192)).max(32),
  busy: z.boolean(),
  navigationRequested: z.boolean().optional(),
  openedFileId: z.string().optional()
})
export type BrowserDocumentState = z.infer<typeof BrowserDocumentState>

export const BrowserDocumentViewerParams = z
  .object({
    viewer: z.literal('host'),
    operation: z.literal('document'),
    page: z.string().min(1).max(1024),
    command: BrowserDocumentCommand
  })
  .refine(
    (value) =>
      value.command.action !== 'directory-allow' || value.command.confirmation === value.page,
    { message: 'Directory access requires confirmation of the exact preview page' }
  )
