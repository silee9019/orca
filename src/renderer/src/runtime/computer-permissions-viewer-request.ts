import type {
  ComputerPermissionsViewerCommand,
  ComputerPermissionsViewerState
} from '../../../shared/rpc-contract/computer-permissions-viewer-params'
export const COMPUTER_PERMISSIONS_VIEWER_EVENT = 'orca:computer-permissions-viewer-command'
export type ComputerPermissionsViewerEvent = {
  command: ComputerPermissionsViewerCommand
  expiresAt: number
  isSettled: () => boolean
  offer: (perform: () => void) => void
  finish: (error?: Error, state?: ComputerPermissionsViewerState) => void
}
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:computer-permissions-viewer-command': CustomEvent<ComputerPermissionsViewerEvent>
  }
}
export function requestComputerPermissionsViewer(
  command: ComputerPermissionsViewerCommand,
  expiresAt: number
): Promise<ComputerPermissionsViewerState> {
  return new Promise((resolve, reject) => {
    const offers: (() => void)[] = []
    let settled = false
    const finish = (error?: Error, state?: ComputerPermissionsViewerState): void => {
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
      () => finish(new Error('computer_permissions_timeout_effect_unknown')),
      Math.max(0, Math.min(1500, expiresAt - Date.now()))
    )
    window.dispatchEvent(
      new CustomEvent(COMPUTER_PERMISSIONS_VIEWER_EVENT, {
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
      finish(new Error('computer_permissions_request_expired'))
    } else if (offers.length !== 1) {
      finish(
        new Error(
          offers.length === 0
            ? 'computer_permissions_owner_unavailable'
            : 'computer_permissions_owner_ambiguous'
        )
      )
    } else {
      offers[0]()
    }
  })
}
