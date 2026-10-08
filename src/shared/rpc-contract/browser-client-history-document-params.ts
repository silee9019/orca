import { z } from 'zod'
import { BrowserClientNavigationTarget } from './browser-client-navigation-params'
import { BrowserClientStagedTarget } from './browser-client-deferred-params'

export const BrowserClientHistoryDocumentSource = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('materialized'), target: BrowserClientNavigationTarget }),
  z.object({ kind: z.literal('staged'), target: BrowserClientStagedTarget })
])
export const BrowserClientHistoryDocumentItem = z.object({
  index: z.number().int().nonnegative(),
  worktreeId: z.string().trim().min(1),
  filePath: z.string().min(1).max(8192)
})
export const BrowserClientHistoryDocumentCommand = z.object({
  viewer: z.literal('host'),
  operation: z.literal('client-history-document'),
  source: BrowserClientHistoryDocumentSource,
  item: BrowserClientHistoryDocumentItem
})
export const BrowserClientHistoryDocumentReceipt = z.object({
  source: BrowserClientHistoryDocumentSource,
  item: BrowserClientHistoryDocumentItem,
  selected: z.literal(true),
  documentWorkspaceId: z.string().min(1),
  documentPageId: z.string().min(1)
})
export type BrowserClientHistoryDocumentCommand = z.infer<
  typeof BrowserClientHistoryDocumentCommand
>
export type BrowserClientHistoryDocumentReceipt = z.infer<
  typeof BrowserClientHistoryDocumentReceipt
>
