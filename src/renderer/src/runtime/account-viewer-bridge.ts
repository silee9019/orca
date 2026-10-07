import type { AccountViewerApi } from '../../../shared/account-viewer-contract'
import { applyResourceManagerViewerAction } from './resource-manager-viewer-actions'
import { applyUsageViewerAction } from './usage-viewer-actions'
import { applyAccountsViewerAction } from './accounts-viewer-actions'

export function registerAccountViewerBridge(api: AccountViewerApi, unsubs: (() => void)[]): void {
  unsubs.push(
    api.onRequest((request) => {
      const apply = async (): Promise<unknown> => {
        switch (request.command.domain) {
          case 'resource':
            return applyResourceManagerViewerAction(request.command.action)
          case 'usage':
            return applyUsageViewerAction(request.command.action)
          case 'account':
            return applyAccountsViewerAction(request.command.action)
        }
      }
      void apply().then(
        (result) => api.acknowledge({ requestId: request.requestId, ok: true, result }),
        (error: unknown) =>
          api.acknowledge({
            requestId: request.requestId,
            ok: false,
            error: error instanceof Error ? error.message.slice(0, 512) : 'viewer_action_failed'
          })
      )
    })
  )
}
