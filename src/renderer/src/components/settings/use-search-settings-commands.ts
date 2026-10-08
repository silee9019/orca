import { useEffect, useRef } from 'react'
import {
  SEARCH_SETTINGS_COMMAND_EVENT,
  type SearchSettingsEvent,
  type SearchSettingsResult
} from '@/runtime/search-settings-request'
import type { SearchSettingsViewerCommand } from '../../../../shared/search-settings-viewer'

export function useSearchSettingsCommands(
  owner: string,
  run: (command: SearchSettingsViewerCommand) => Promise<SearchSettingsResult>
): void {
  const pending = useRef<SearchSettingsEvent | null>(null)
  useEffect(() => {
    const receive = (event: WindowEventMap['orca:search-settings-command']): void => {
      const request = event.detail
      const command = request.command
      const target =
        command.operation === 'list-toggle'
          ? 'list'
          : 'executionHostId' in command
            ? command.executionHostId
            : 'pane'
      if (target !== owner || !request.claim()) {
        return
      }
      if (Date.now() >= request.expiresAt) {
        request.finish(new Error('request_expired'))
        return
      }
      if (pending.current) {
        request.finish(new Error('search_settings_busy'))
        return
      }
      pending.current = request
      void run(command)
        .then(
          (result) => request.finish(undefined, result),
          (error) =>
            request.finish(
              error instanceof Error && /^[a-z][a-z0-9_]*$/.test(error.message)
                ? error
                : new Error('search_settings_failed')
            )
        )
        .finally(() => {
          if (pending.current === request) {
            pending.current = null
          }
        })
    }
    window.addEventListener(SEARCH_SETTINGS_COMMAND_EVENT, receive)
    return () => window.removeEventListener(SEARCH_SETTINGS_COMMAND_EVENT, receive)
  }, [owner, run])
  useEffect(
    () => () => {
      pending.current?.finish(new Error('search_settings_owner_changed_effect_unknown'))
      pending.current = null
    },
    [owner]
  )
}
