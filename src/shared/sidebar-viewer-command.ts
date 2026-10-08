import { z } from 'zod'
import { openEnum } from './zod-salvage'
import type { SidebarViewerCommand } from './rpc-contract/sidebar-viewer-params'
export const SidebarViewerSnapshotSchema = z
  .object({
    leftMounted: z.boolean(),
    leftVisible: z.boolean(),
    rightMounted: z.boolean(),
    rightVisible: z.boolean(),
    panel: z.string().nullable(),
    explorerView: z.string().nullable(),
    panelReady: z.boolean(),
    availablePanels: z.array(z.string())
  })
  .strip()
export type SidebarViewerSnapshot = z.infer<typeof SidebarViewerSnapshotSchema>
export const SidebarViewerResultSchema = z
  .object({
    viewer: z.literal('host'),
    viewerId: z.number().int(),
    dispatched: z.boolean(),
    applied: z.boolean(),
    persisted: z.null(),
    sidebarOpen: z.boolean(),
    rightSidebarOpen: z.boolean(),
    rightSidebarTab: z.string(),
    explorerView: z.string(),
    rendered: SidebarViewerSnapshotSchema,
    reason: openEnum(
      ['viewer_not_applied', 'viewer_runtime_changed', 'viewer_surface_superseded'],
      'viewer_not_applied'
    ).optional()
  })
  .strip()
export type SidebarViewerResult = z.infer<typeof SidebarViewerResultSchema>
export type SidebarViewerRequest = { id: string; expiresAt: number; command: SidebarViewerCommand }
export type SidebarViewerResponse =
  | { id: string; ok: true; result: SidebarViewerResult }
  | { id: string; ok: false; error: string }
