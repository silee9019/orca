import { useEffect, useLayoutEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { BROWSER_PROFILE_UI_COMMAND_EVENT } from '@/runtime/browser-profile-ui-request'
import type { BrowserProfileUiState } from '../../../../../shared/rpc-contract/browser-profile-ui-params'

export type BrowserToolbarSettingsOwner = {
  page: string
  active: boolean
  snapshot: BrowserProfileUiState
}

export function useBrowserToolbarSettingsCommands(
  owner: BrowserToolbarSettingsOwner | undefined,
  menuOpen: boolean
): { openSettings: () => void; itemRef: React.RefObject<HTMLDivElement | null> } {
  const itemRef = useRef<HTMLDivElement>(null)
  const current = useRef({ owner, menuOpen })
  useLayoutEffect(() => {
    current.current = { owner, menuOpen }
  })
  const openSettings = (): void => {
    useAppStore.getState().openSettingsTarget({ pane: 'browser', repoId: null })
    useAppStore.getState().openSettingsPage()
  }
  useEffect(() => {
    const receive = (event: WindowEventMap['orca:browser-profile-ui-command']): void => {
      const request = event.detail
      const before = current.current
      const owner = before.owner
      if (
        request.command.action !== 'settings-open' ||
        !owner?.active ||
        owner.page !== request.page
      ) {
        return
      }
      request.offer(() => {
        if (
          request.isSettled() ||
          Date.now() >= request.expiresAt ||
          current.current.owner !== owner ||
          !before.menuOpen ||
          !itemRef.current?.isConnected
        ) {
          request.finish(new Error('browser_toolbar_settings_owner_unavailable'))
          return
        }
        const state = useAppStore.getState()
        if (!state.persistedUIReady || state.activeModal !== 'none') {
          request.finish(new Error('browser_toolbar_settings_viewer_not_ready'))
          return
        }
        try {
          itemRef.current.click()
          const after = useAppStore.getState()
          if (
            after.activeView !== 'settings' ||
            after.settingsNavigationTarget?.pane !== 'browser' ||
            after.settingsNavigationTarget.repoId !== null ||
            after.settingsSearchQuery !== ''
          ) {
            request.finish(new Error('browser_toolbar_settings_not_applied_effect_unknown'))
            return
          }
          request.finish(undefined, {
            ...owner.snapshot,
            settings: { activeView: 'settings', pane: 'browser', repoId: null, search: '' }
          })
        } catch {
          request.finish(new Error('browser_toolbar_settings_failed_effect_unknown'))
        }
      })
    }
    window.addEventListener(BROWSER_PROFILE_UI_COMMAND_EVENT, receive)
    return () => window.removeEventListener(BROWSER_PROFILE_UI_COMMAND_EVENT, receive)
  }, [])
  return { openSettings, itemRef }
}
