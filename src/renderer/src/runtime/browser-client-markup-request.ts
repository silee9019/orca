import { isBrowserClientPageViewerTargetCurrent as isBrowserClientMarkupTargetCurrent } from './browser-client-page-viewer-target'
export { isBrowserClientPageViewerTargetCurrent as isBrowserClientMarkupTargetCurrent } from './browser-client-page-viewer-target'
import { requestBrowserMarkupEditor } from './browser-markup-editor-request'
import type { BrowserViewerResult } from '../../../shared/browser-viewer-command'
import { requestBrowserMarkup } from './browser-markup-request'
import type {
  BrowserClientMarkupTarget,
  BrowserClientMarkupAction,
  BrowserClientMarkupReceipt
} from '../../../shared/rpc-contract/browser-client-markup-params'
export async function requestBrowserClientMarkup(
  target: BrowserClientMarkupTarget,
  action: BrowserClientMarkupAction,
  expiresAt: number
): Promise<BrowserClientMarkupReceipt> {
  if (!isBrowserClientMarkupTargetCurrent(target)) {
    throw new Error('browser_client_markup_target_mismatch')
  }
  let copied = false
  if (action === 'copy') {
    const receipt = await requestBrowserMarkupEditor(
      target.page,
      { action: 'copy' },
      expiresAt,
      target
    )
    if (
      !receipt.copied ||
      !receipt.clientTarget ||
      !isBrowserClientMarkupTargetCurrent(target) ||
      Object.entries(target).some(
        ([key, value]) => Reflect.get(receipt.clientTarget ?? {}, key) !== value
      )
    ) {
      throw new Error('browser_client_markup_copy_effect_unknown')
    }
    copied = true
  }
  const result = await requestBrowserMarkup(
    target.page,
    action === 'copy' ? 'status' : action,
    expiresAt,
    target,
    action === 'copy' ? 'idle' : undefined
  )
  if (
    !isBrowserClientMarkupTargetCurrent(target) ||
    !result.clientTarget ||
    Object.entries(target).some(
      ([key, value]) => Reflect.get(result.clientTarget ?? {}, key) !== value
    )
  ) {
    throw new Error('browser_client_markup_owner_changed_effect_unknown')
  }
  if (copied && (result.state !== 'idle' || result.hasImage)) {
    throw new Error('browser_client_markup_copy_effect_unknown')
  }
  return {
    ...target,
    action,
    state: result.state,
    hasImage: result.hasImage,
    ...(copied ? { copied: true as const } : {}),
    accepted: true
  }
}

export async function applyBrowserClientMarkupRequest(
  command: { target: BrowserClientMarkupTarget; action: BrowserClientMarkupAction },
  expiresAt: number
): Promise<BrowserViewerResult> {
  const clientMarkup = await requestBrowserClientMarkup(command.target, command.action, expiresAt)
  return {
    viewer: 'host',
    viewerId: 0,
    persisted: false,
    rendered: false,
    page: command.target.page,
    clientMarkup,
    applied: true
  }
}
