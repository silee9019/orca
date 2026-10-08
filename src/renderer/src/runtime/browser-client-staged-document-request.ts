import type { z } from 'zod'
import type { BrowserViewerResult } from '../../../shared/browser-viewer-command'
import {
  BrowserClientStagedDocumentViewerCommand,
  BrowserClientStagedDocumentReceipt
} from '../../../shared/rpc-contract/browser-client-staged-document-params'
import { requestBrowserClientDocumentEffect } from './browser-client-document-request'
export async function applyBrowserClientStagedDocumentRequest(
  command: z.infer<typeof BrowserClientStagedDocumentViewerCommand>,
  expiresAt: number
): Promise<BrowserViewerResult> {
  const parsed = BrowserClientStagedDocumentViewerCommand.parse(command)
  const receipt = await requestBrowserClientDocumentEffect(
    { kind: 'staged', target: parsed.target },
    parsed.value,
    parsed.documentWorktreeId ?? parsed.target.worktreeId,
    expiresAt
  )
  return {
    viewer: 'host',
    viewerId: 0,
    applied: true,
    persisted: false,
    rendered: false,
    clientStagedDocument: BrowserClientStagedDocumentReceipt.parse({
      ...receipt,
      hostPlacementKnown: false
    })
  }
}
