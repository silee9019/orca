import { z } from 'zod'
import { openEnum } from '../zod-salvage'
import { BrowserClientNavigationTarget } from './browser-client-navigation-params'
export const BrowserClientDocumentValue = z.string().trim().min(1).max(8192)
export const BrowserClientDocumentViewerCommand = z.object({
  viewer: z.literal('host'),
  operation: z.literal('client-document'),
  entry: z.literal('address-bar'),
  target: BrowserClientNavigationTarget,
  value: BrowserClientDocumentValue,
  documentWorktreeId: z.string().trim().min(1).optional()
})
export const BrowserClientDocumentReceipt = BrowserClientNavigationTarget.extend({
  accepted: z.literal(true),
  conversion: openEnum(
    ['converted', 'activated-existing', 'opened-in-owning-worktree', 'unknown'],
    'unknown'
  ),
  documentWorktreeId: z.string().min(1),
  documentPageId: z.string().min(1),
  documentWorkspaceId: z.string().min(1),
  filePath: z.string().min(1)
})
export type BrowserClientDocumentReceipt = z.infer<typeof BrowserClientDocumentReceipt>
