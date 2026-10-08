import { z } from 'zod'

const PaneIds = z.array(z.string().min(1)).min(1).max(100)
export const AccountInspectionParams = z.discriminatedUnion('action', [
  z.object({ action: z.literal('cursor-status') }).strict(),
  z.object({ action: z.literal('grok-status') }).strict(),
  z.object({ action: z.literal('codex-sync-status') }).strict(),
  z.object({ action: z.literal('codex-stale-panes'), ptyIds: PaneIds }).strict(),
  z.object({ action: z.literal('codex-recorded-lanes'), ptyIds: PaneIds }).strict(),
  z
    .object({ action: z.literal('codex-forget-panes'), ptyIds: PaneIds, confirm: z.literal(true) })
    .strict()
])
