import { useEffect, useRef } from 'react'
import {
  BrowserSettingsCommand,
  type BrowserSettingsState
} from '../../../../shared/rpc-contract/browser-settings-params'
import { BROWSER_SETTINGS_EVENT } from '@/runtime/browser-settings-request'

type Options = {
  accepts: (command: BrowserSettingsCommand) => boolean
  apply: (command: BrowserSettingsCommand) => Promise<void> | void
  read: () => BrowserSettingsState
}
export function useBrowserSettingsRequest(options: Options): void {
  const current = useRef(options)
  current.current = options
  useEffect(() => {
    const receive = (event: WindowEventMap[typeof BROWSER_SETTINGS_EVENT]): void => {
      const request = event.detail
      const command = BrowserSettingsCommand.parse(request.command)
      if (!current.current.accepts(command) || !request.claim()) {
        return
      }
      void Promise.resolve()
        .then(async () => {
          if (request.isSettled() || Date.now() >= request.expiresAt) {
            throw new Error('browser_settings_request_expired')
          }
          if (current.current.read().hostId !== request.hostId) {
            throw new Error('browser_settings_host_mismatch')
          }
          await current.current.apply(command)
          requestAnimationFrame(() => {
            if (!request.isSettled()) {
              request.finish(undefined, current.current.read())
            }
          })
        })
        .catch(() => request.finish(new Error('browser_settings_action_failed_effect_unknown')))
    }
    window.addEventListener(BROWSER_SETTINGS_EVENT, receive)
    return () => window.removeEventListener(BROWSER_SETTINGS_EVENT, receive)
  }, [])
}
