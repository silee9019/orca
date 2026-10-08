export const VOICE_MODEL_MENU_EVENT = 'orca:voice-model-menu-command'
export type VoiceModelMenuEvent = {
  action: 'open' | 'close' | 'status'
  expiresAt: number
  isSettled: () => boolean
  offer: (perform: () => void) => void
  finish: (error?: Error, open?: boolean) => void
}
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:voice-model-menu-command': CustomEvent<VoiceModelMenuEvent>
  }
}
export function requestVoiceModelMenu(
  action: VoiceModelMenuEvent['action'],
  expiresAt: number
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const offers: (() => void)[] = []
    let settled = false
    const finish = (error?: Error, open?: boolean): void => {
      if (settled) {
        return
      }
      settled = true
      window.clearTimeout(timer)
      if (error) {
        reject(error)
      } else if (typeof open === 'boolean') {
        resolve(open)
      } else {
        reject(new Error('voice_model_menu_receipt_missing'))
      }
    }
    const timer = window.setTimeout(
      () => finish(new Error('voice_model_menu_timeout_effect_unknown')),
      Math.max(0, expiresAt - Date.now())
    )
    window.dispatchEvent(
      new CustomEvent(VOICE_MODEL_MENU_EVENT, {
        detail: {
          action,
          expiresAt,
          isSettled: () => settled,
          finish,
          offer: (perform) => {
            if (!settled && offers.length < 2) {
              offers.push(perform)
            }
          }
        }
      })
    )
    if (Date.now() >= expiresAt) {
      finish(new Error('request_expired'))
    } else if (offers.length !== 1) {
      finish(
        new Error(
          offers.length ? 'voice_model_menu_owner_ambiguous' : 'voice_model_menu_owner_unavailable'
        )
      )
    } else {
      offers[0]()
    }
  })
}
