import { z } from 'zod'
import type { BrowserViewerCommand } from './rpc-contract/browser-viewer-params'
import { BrowserToolbarAction, BrowserViewerPreset } from './rpc-contract/browser-viewer-params'

export type BrowserViewerRequest = { id: string; expiresAt: number; command: BrowserViewerCommand }
// applied reports store read-back or service acceptance; rendering and durable saving need separate evidence.
export const BrowserViewerResultSchema = z.object({
  viewer: z.literal('host'),
  viewerId: z.number().int(),
  applied: z.boolean(),
  persisted: z.literal(false),
  rendered: z.literal(false),
  page: z.string().optional(),
  grab: z
    .object({
      state: z.enum(['idle', 'armed', 'awaiting', 'confirming', 'error']),
      hasSelection: z.boolean(),
      hasScreenshot: z.boolean(),
      contextMenu: z.boolean()
    })
    .optional(),
  toolbar: z
    .object({
      action: BrowserToolbarAction,
      intent: z
        .enum(['stop', 'retry-guest-recovery', 'retry-load', 'reload', 'hard-reload'])
        .optional()
    })
    .optional(),
  find: z
    .object({
      open: z.boolean(),
      query: z.string(),
      activeMatch: z.number().int(),
      totalMatches: z.number().int()
    })
    .optional(),
  draft: z.object({ hasDraft: z.boolean(), annotationId: z.string().optional() }).optional(),
  zoomLevel: z.number().finite().optional(),
  annotations: z
    .array(
      z.object({
        id: z.string(),
        comment: z.string(),
        intent: z.enum(['fix', 'change', 'question', 'approve']),
        priority: z.enum(['blocking', 'important', 'suggestion']),
        createdAt: z.string()
      })
    )
    .optional(),
  history: z
    .array(z.object({ url: z.string(), title: z.string(), lastVisitedAt: z.number() }))
    .optional(),
  preset: BrowserViewerPreset.nullable().optional()
})
export type BrowserViewerResult = z.infer<typeof BrowserViewerResultSchema>
export type BrowserViewerResponse = { id: string } & (
  | { ok: true; result: BrowserViewerResult }
  | { ok: false; error: string }
)
export type BrowserViewerEventApi = {
  onBrowserViewerRequest?: (callback: (request: BrowserViewerRequest) => void) => () => void
  respondBrowserViewer?: (response: BrowserViewerResponse) => void
}
