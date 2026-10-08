import {
  BrowserTitlebarPairedActivationTarget,
  type BrowserTitlebarPairedActivationState
} from '../../../shared/rpc-contract/browser-titlebar-paired-activation-params'
export class BrowserTitlebarPairedActivationEvent extends Event {
  readonly offers: (() => Promise<BrowserTitlebarPairedActivationState>)[] = []
  constructor(
    readonly commandTarget: BrowserTitlebarPairedActivationTarget,
    readonly expiresAt: number
  ) {
    super('orca:browser-titlebar-paired-activation')
  }
}
export async function requestBrowserTitlebarPairedActivation(
  target: BrowserTitlebarPairedActivationTarget,
  expiresAt: number
): Promise<BrowserTitlebarPairedActivationState> {
  if (Date.now() >= expiresAt) {
    throw new Error('browser_titlebar_activation_expired')
  }
  const event = new BrowserTitlebarPairedActivationEvent(
    BrowserTitlebarPairedActivationTarget.parse(target),
    expiresAt
  )
  window.dispatchEvent(event)
  if (event.offers.length !== 1) {
    throw new Error(
      event.offers.length
        ? 'browser_titlebar_activation_ambiguous'
        : 'browser_titlebar_activation_unavailable'
    )
  }
  const result = await event.offers[0]()
  if (Date.now() >= expiresAt) {
    throw new Error('browser_titlebar_activation_expired_effect_unknown')
  }
  return result
}
