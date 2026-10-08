import type { BrowserViewerResult } from '../../../shared/browser-viewer-command'
import { BrowserClientFindViewerCommand } from '../../../shared/rpc-contract/browser-client-find-params'
import type { z } from 'zod'
import { isBrowserClientPageViewerTargetCurrent } from './browser-client-page-viewer-target'
import { requestBrowserFind } from './browser-find-request'
export async function applyBrowserClientFindRequest(
  command: z.infer<typeof BrowserClientFindViewerCommand>,
  expiresAt: number
): Promise<BrowserViewerResult> {
  const parsed = BrowserClientFindViewerCommand.parse(command)
  if (!isBrowserClientPageViewerTargetCurrent(parsed.target)) {
    throw new Error('browser_client_find_target_unavailable')
  }
  const state = await requestBrowserFind(
    parsed.target.page,
    parsed.action,
    expiresAt,
    parsed.query,
    parsed.target
  )
  if (!isBrowserClientPageViewerTargetCurrent(parsed.target)) {
    throw new Error('browser_client_find_owner_changed_effect_unknown')
  }
  return {
    viewer: 'host',
    viewerId: 0,
    applied: true,
    persisted: false,
    rendered: false,
    clientFind: { target: parsed.target, state }
  }
}
