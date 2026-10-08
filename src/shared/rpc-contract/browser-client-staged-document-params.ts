import { z } from 'zod'
import { BrowserClientStagedTarget } from './browser-client-deferred-params'
import {
  BrowserClientDocumentViewerCommand,
  BrowserClientDocumentValue,
  BrowserClientDocumentReceipt
} from './browser-client-document-params'
export const BrowserClientStagedDocumentViewerCommand = z.object({
  viewer: z.literal('host'),
  operation: z.literal('client-staged-document'),
  entry: z.literal('address-bar-staged'),
  target: BrowserClientStagedTarget,
  value: BrowserClientDocumentValue,
  documentWorktreeId: z.string().trim().min(1).optional()
})
export const BrowserClientDocumentEffectReceipt = BrowserClientStagedTarget.merge(
  BrowserClientDocumentReceipt.pick({
    accepted: true,
    conversion: true,
    documentWorktreeId: true,
    documentPageId: true,
    documentWorkspaceId: true,
    filePath: true
  })
)
export type BrowserClientDocumentEffectReceipt = z.infer<typeof BrowserClientDocumentEffectReceipt>
export const BrowserClientStagedDocumentReceipt = BrowserClientDocumentEffectReceipt.extend({
  hostPlacementKnown: z.literal(false)
})
export type BrowserClientStagedDocumentReceipt = z.infer<typeof BrowserClientStagedDocumentReceipt>

export const BrowserClientDocumentViewerCommands = [
  BrowserClientDocumentViewerCommand,
  BrowserClientStagedDocumentViewerCommand
] as const
