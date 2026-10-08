import type { BrowserViewerResult } from '../../../shared/browser-viewer-command'
import {
  BrowserClientAddressViewerCommand,
  type BrowserClientAddressTarget
} from '../../../shared/rpc-contract/browser-client-address-params'
import type { BrowserAddressCommand } from '../../../shared/rpc-contract/browser-address-params'
import { isBrowserClientPageViewerTargetCurrent } from './browser-client-page-viewer-target'
import { requestBrowserAddress } from './browser-address-request'
export async function applyBrowserClientAddressRequest(
  command: { target: BrowserClientAddressTarget; command: BrowserAddressCommand },
  expiresAt: number
): Promise<BrowserViewerResult> {
  const parsed = BrowserClientAddressViewerCommand.parse({
    ...command,
    viewer: 'host',
    operation: 'client-address'
  })
  if (!isBrowserClientPageViewerTargetCurrent(parsed.target)) {
    throw new Error('browser_client_address_target_unavailable')
  }
  const state = await requestBrowserAddress(
    parsed.target.page,
    parsed.command,
    expiresAt,
    parsed.target
  )
  if (!isBrowserClientPageViewerTargetCurrent(parsed.target)) {
    throw new Error('browser_client_address_owner_changed_effect_unknown')
  }
  return {
    viewer: 'host' as const,
    viewerId: 0,
    persisted: false,
    rendered: false,
    applied: true,
    clientAddress: { target: parsed.target, state }
  }
}
