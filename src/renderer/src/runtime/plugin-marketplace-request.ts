import type {
  PluginMarketplaceViewerCommand,
  PluginMarketplaceViewerState
} from '../../../shared/rpc-contract/plugin-marketplace-viewer-params'

export const PLUGIN_MARKETPLACE_EVENT = 'orca:plugin-marketplace-command'
export type PluginMarketplaceEvent = {
  command: PluginMarketplaceViewerCommand
  expiresAt: number
  isSettled: () => boolean
  offer: (perform: () => void) => void
  finish: (error?: Error, state?: PluginMarketplaceViewerState) => void
}
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:plugin-marketplace-command': CustomEvent<PluginMarketplaceEvent>
  }
}
export function requestPluginMarketplace(
  command: PluginMarketplaceViewerCommand,
  expiresAt: number
): Promise<PluginMarketplaceViewerState> {
  return new Promise((resolve, reject) => {
    const offers: (() => void)[] = []
    let settled = false
    const finish = (error?: Error, state?: PluginMarketplaceViewerState): void => {
      if (settled) {
        return
      }
      settled = true
      window.clearTimeout(timer)
      if (error) {
        reject(error)
      } else if (state) {
        resolve(state)
      }
    }
    const timer = window.setTimeout(
      () => finish(new Error('plugin_marketplace_timeout_effect_unknown')),
      Math.max(0, Math.min(1500, expiresAt - Date.now()))
    )
    window.dispatchEvent(
      new CustomEvent(PLUGIN_MARKETPLACE_EVENT, {
        detail: {
          command,
          expiresAt,
          isSettled: () => settled,
          offer: (perform) => {
            if (!settled && offers.length < 2) {
              offers.push(perform)
            }
          },
          finish
        }
      })
    )
    if (Date.now() >= expiresAt) {
      finish(new Error('plugin_marketplace_request_expired'))
    } else if (offers.length !== 1) {
      finish(
        new Error(
          offers.length === 0
            ? 'plugin_marketplace_owner_unavailable'
            : 'plugin_marketplace_owner_ambiguous'
        )
      )
    } else {
      offers[0]()
    }
  })
}
