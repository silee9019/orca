import { useEffect, useRef } from 'react'
import {
  BrowserSettingsCommand,
  type BrowserSettingsState
} from '../../../../shared/rpc-contract/browser-settings-params'
import { BROWSER_SETTINGS_EVENT } from '@/runtime/browser-settings-request'

type Options = {
  accepts: (command: BrowserSettingsCommand) => boolean
  apply: (command: BrowserSettingsCommand, expiresAt: number) => Promise<void> | void
  read: () => BrowserSettingsState
  verify?: (command: BrowserSettingsCommand, state: BrowserSettingsState) => boolean
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
          await current.current.apply(command, request.expiresAt)
          requestAnimationFrame(() => {
            if (!request.isSettled()) {
              const state = current.current.read()
              const expected = command.action === 'host-select' ? command.hostId : request.hostId
              if (state.hostId !== expected) {
                request.finish(new Error('browser_settings_host_changed_effect_unknown'))
              } else if (current.current.verify && !current.current.verify(command, state)) {
                request.finish(new Error('browser_settings_owner_readback_unknown'))
              } else {
                request.finish(undefined, state)
              }
            }
          })
        })
        .catch(() => request.finish(new Error('browser_settings_action_failed_effect_unknown')))
    }
    window.addEventListener(BROWSER_SETTINGS_EVENT, receive)
    return () => window.removeEventListener(BROWSER_SETTINGS_EVENT, receive)
  }, [])
}
