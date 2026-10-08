import type { BrowserImportHintEvent } from './browser-import-hint-request'
import { requireBrowserImportHintIdentity } from './browser-import-hint-actions'
import { useAppStore } from '@/store'
export function watchBrowserImportHintBinding(
  request: BrowserImportHintEvent,
  onInvalid: () => void
): () => void {
  const command = request.command
  let cleanupStore = (): void => {}
  let hiddenDeparture = false
  let settingsDeparture = false
  const checkStore = (): void => {
    if (request.isSettled()) {
      cleanupStore()
      return
    }
    try {
      requireBrowserImportHintIdentity(command)
      const state = useAppStore.getState()
      if (
        state.activeModal !== 'none' ||
        (command.action === 'settings' && state.browserImportHintHidden)
      ) {
        throw new Error('surface_changed')
      }
      if (command.action === 'settings') {
        if (state.activeView === 'settings') {
          if (
            state.settingsNavigationTarget?.pane !== 'browser' ||
            state.settingsNavigationTarget.repoId !== null
          ) {
            throw new Error('settings_changed')
          }
          settingsDeparture = true
        } else if (state.activeView !== 'terminal' || settingsDeparture) {
          throw new Error('surface_changed')
        }
      } else {
        if (state.activeView !== 'terminal') {
          throw new Error('surface_changed')
        }
        if (command.action === 'hide') {
          if (state.browserImportHintHidden) {
            hiddenDeparture = true
          } else if (hiddenDeparture) {
            throw new Error('hide_changed')
          }
        } else if (state.browserImportHintHidden) {
          throw new Error('hint_hidden')
        }
      }
    } catch {
      onInvalid()
      request.finish(new Error('browser_import_hint_effect_unknown'))
      cleanupStore()
    }
  }
  const unsubscribe = useAppStore.subscribe(checkStore)
  const expiryTimer = window.setTimeout(
    () => cleanupStore(),
    Math.max(0, Math.min(1500, request.expiresAt - Date.now()))
  )
  cleanupStore = () => {
    unsubscribe()
    window.clearTimeout(expiryTimer)
  }
  checkStore()
  return cleanupStore
}
