import { z } from 'zod'
import { BrowserOverlayFocusCommand } from './browser-overlay-focus-params'
export const BrowserPairedNewTabTarget = z.object({
  worktree: z.string().min(1),
  group: z.string().min(1).optional(),
  environmentId: z.string().min(1),
  executionHostId: BrowserOverlayFocusCommand.shape.executionHostId,
  pairingRevision: z.number().int().nonnegative()
})
export type BrowserPairedNewTabTarget = z.infer<typeof BrowserPairedNewTabTarget>
export const BrowserPairedNewTabState = z.object({
  target: BrowserPairedNewTabTarget,
  workspace: z.string().min(1),
  page: z.string().min(1),
  unifiedTab: z.string().min(1),
  remotePageId: z.string().min(1),
  materialized: z.literal(true),
  guestRegistrationVerified: z.literal(false)
})
export type BrowserPairedNewTabState = z.infer<typeof BrowserPairedNewTabState>

export const BrowserPairedNewTabCommand = z.object({
  viewer: z.literal('host'),
  operation: z.literal('new-tab-paired'),
  target: BrowserPairedNewTabTarget
})
