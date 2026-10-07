import type {
  RemoteFilePickerCommand,
  RemoteFilePickerState
} from '../../../shared/rpc-contract/remote-file-picker-params'
export const REMOTE_FILE_PICKER_EVENT = 'orca:remote-file-picker-command'
export type RemoteFilePickerRequest = {
  command: RemoteFilePickerCommand
  expiresAt: number
  isSettled: () => boolean
  offer: (execute: () => void) => void
  finish: (error?: Error, state?: RemoteFilePickerState) => void
}
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:remote-file-picker-command': CustomEvent<RemoteFilePickerRequest>
  }
}
export function requestRemoteFilePicker(
  command: RemoteFilePickerCommand,
  expiresAt: number
): Promise<RemoteFilePickerState> {
  return new Promise((resolve, reject) => {
    let settled = false
    const offers: (() => void)[] = []
    const finish = (error?: Error, state?: RemoteFilePickerState) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      if (error) {
        reject(error)
      } else if (state) {
        resolve(state)
      } else {
        reject(new Error('invalid_remote_picker_receipt'))
      }
    }
    const timer = setTimeout(
      () => finish(new Error('remote_picker_timeout_effect_unknown')),
      Math.max(0, expiresAt - Date.now())
    )
    window.dispatchEvent(
      new CustomEvent(REMOTE_FILE_PICKER_EVENT, {
        detail: {
          command,
          expiresAt,
          finish,
          isSettled: () => settled,
          offer: (execute) => offers.push(execute)
        }
      })
    )
    if (offers.length !== 1) {
      finish(new Error(offers.length ? 'remote_picker_ambiguous' : 'remote_picker_unavailable'))
    } else {
      offers[0]()
    }
  })
}
