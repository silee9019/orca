import { useEffect, useLayoutEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import {
  requireBrowserImportHint,
  requireBrowserImportHintIdentity
} from '@/runtime/browser-import-hint-actions'
import { BROWSER_IMPORT_HINT_EVENT } from '@/runtime/browser-import-hint-request'
export type ImportHintPersistenceReceipt = { saved: boolean; isCurrent: () => boolean }
type ImportHintOwner = {
  pageId?: string
  profileId: string
  available: boolean
  active: boolean
  open: boolean
  menuOpen: boolean
  getRevision: () => number
  changeOpen: (value: boolean) => Promise<void>
  changeMenu: (value: boolean) => void
  openSettings: () => void
  hide: () => Promise<ImportHintPersistenceReceipt>
}
export function useBrowserImportHintOwner(owner: ImportHintOwner): void {
  const current = useRef(owner)
  const targetGeneration = useRef(0)
  const activityGeneration = useRef(0)
  const availabilityGeneration = useRef(0)
  const mounted = useRef(false)
  useLayoutEffect(() => {
    const previous = current.current
    if (previous.pageId !== owner.pageId || previous.profileId !== owner.profileId) {
      targetGeneration.current += 1
    }
    if (previous.active !== owner.active) {
      activityGeneration.current += 1
    }
    if (previous.available !== owner.available) {
      availabilityGeneration.current += 1
    }
    current.current = owner
  })
  const busy = useRef(false)
  useEffect(() => {
    mounted.current = true
    const receive = (event: WindowEventMap[typeof BROWSER_IMPORT_HINT_EVENT]): void => {
      const request = event.detail
      const command = request.command
      if (
        current.current.pageId !== command.pageId ||
        current.current.profileId !== command.profileId
      ) {
        return
      }
      request.offer(() => {
        let started = false
        let cleanupStore = (): void => {}
        let storeCurrent = true
        try {
          requireBrowserImportHint(command)
          const initial = current.current
          if (!initial.available || busy.current) {
            throw new Error('browser_import_hint_owner_busy_or_inactive')
          }
          if (request.isSettled() || Date.now() >= request.expiresAt) {
            throw new Error('browser_import_hint_request_expired')
          }
          if (
            command.action === 'menu-open' &&
            (!initial.open ||
              useAppStore.getState().browserSessionImportState?.status === 'importing')
          ) {
            throw new Error('browser_import_hint_menu_unavailable')
          }
          const targetBinding = targetGeneration.current
          const activeBinding = activityGeneration.current
          const availabilityBinding = availabilityGeneration.current
          const bindingCurrent = (): boolean => {
            const departing = command.action === 'settings' || command.action === 'hide'
            const activityCurrent =
              activityGeneration.current === activeBinding ||
              (command.action === 'settings' &&
                activityGeneration.current === activeBinding + 1 &&
                !current.current.active)
            const availabilityCurrent =
              availabilityGeneration.current === availabilityBinding ||
              (departing &&
                availabilityGeneration.current === availabilityBinding + 1 &&
                !current.current.available)
            return (
              storeCurrent &&
              (mounted.current || departing) &&
              targetGeneration.current === targetBinding &&
              activityCurrent &&
              availabilityCurrent
            )
          }
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
              const hiding = command.action === 'hide'
              if (state.activeModal !== 'none' || (state.browserImportHintHidden && !hiding)) {
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
                }
              }
            } catch {
              storeCurrent = false
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
          if (!storeCurrent) {
            return
          }
          busy.current = true
          started = true
          let expectedOpen = initial.open
          let expectedMenu = initial.menuOpen
          let persistence: ImportHintPersistenceReceipt | undefined
          let completion: Promise<void> = Promise.resolve()
          if (command.action === 'open' || command.action === 'close') {
            expectedOpen = command.action === 'open'
            if (!expectedOpen) {
              expectedMenu = false
            }
            completion = initial.changeOpen(expectedOpen)
          } else if (command.action === 'menu-open' || command.action === 'menu-close') {
            expectedMenu = command.action === 'menu-open'
            initial.changeMenu(expectedMenu)
          } else if (command.action === 'hide') {
            expectedOpen = false
            expectedMenu = false
            completion = initial.hide().then(async (receipt) => {
              persistence = receipt
              if (
                !receipt.saved ||
                !receipt.isCurrent() ||
                request.isSettled() ||
                Date.now() >= request.expiresAt
              ) {
                throw new Error('browser_import_hint_persistence_unacknowledged')
              }
              requireBrowserImportHintIdentity(command)
              const currentState = useAppStore.getState()
              if (
                !bindingCurrent() ||
                initial.getRevision() !== revision ||
                !currentState.browserImportHintHidden ||
                currentState.activeModal !== 'none' ||
                currentState.activeView !== 'terminal'
              ) {
                throw new Error('browser_import_hint_hide_superseded')
              }
              const persisted = await window.api.ui.get()
              if (
                !bindingCurrent() ||
                !receipt.isCurrent() ||
                persisted.browserImportHintHidden !== true
              ) {
                throw new Error('browser_import_hint_persistence_unacknowledged')
              }
            })
          } else if (command.action === 'settings') {
            expectedOpen = false
            expectedMenu = false
            initial.openSettings()
          }
          const revision = initial.getRevision()
          void completion
            .then(async () => {
              while (!request.isSettled() && Date.now() < request.expiresAt) {
                if (!bindingCurrent() || initial.getRevision() !== revision) {
                  throw new Error('browser_import_hint_transition_superseded')
                }
                requireBrowserImportHintIdentity(command)
                const state = useAppStore.getState()
                if (command.action === 'settings') {
                  if (
                    state.activeModal !== 'none' ||
                    state.activeView !== 'settings' ||
                    state.settingsNavigationTarget?.pane !== 'browser' ||
                    state.settingsNavigationTarget.repoId !== null
                  ) {
                    throw new Error('browser_import_hint_settings_unacknowledged')
                  }
                } else if (command.action === 'hide') {
                  if (
                    !persistence?.isCurrent() ||
                    !state.browserImportHintHidden ||
                    state.activeModal !== 'none' ||
                    state.activeView !== 'terminal'
                  ) {
                    throw new Error('browser_import_hint_hide_superseded')
                  }
                } else {
                  requireBrowserImportHint(command)
                  if (!current.current.available) {
                    throw new Error('browser_import_hint_owner_inactive')
                  }
                }
                const markers = Array.from(
                  document.querySelectorAll<HTMLElement>('[data-browser-import-hint-page]')
                ).filter((node) => node.dataset.browserImportHintPage === command.pageId)
                const popovers = Array.from(
                  document.querySelectorAll('[data-import-hint-content]')
                ).filter((node) => node.getAttribute('data-import-hint-content') === command.pageId)
                const menus = Array.from(
                  document.querySelectorAll('[data-import-hint-menu]')
                ).filter((node) => node.getAttribute('data-import-hint-menu') === command.pageId)
                const detachedSettings =
                  (command.action === 'settings' || command.action === 'hide') &&
                  markers.length === 0
                const committed =
                  markers.length === 1 &&
                  markers[0].dataset.importHintOpen === String(expectedOpen) &&
                  markers[0].dataset.importMenuOpen === String(expectedMenu)
                if (
                  (detachedSettings || committed) &&
                  popovers.length === Number(expectedOpen) &&
                  menus.length === Number(expectedMenu)
                ) {
                  request.finish(undefined, {
                    open: expectedOpen,
                    menuOpen: expectedMenu,
                    detectionSettled: state.detectedBrowsersLoaded,
                    settingsOpened: command.action === 'settings',
                    hidden: state.browserImportHintHidden,
                    ...(command.action === 'hide' ? { persisted: true } : {})
                  })
                  return
                }
                await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
              }
              throw new Error('browser_import_hint_timeout_effect_unknown')
            })
            .catch(() => request.finish(new Error('browser_import_hint_effect_unknown')))
            .finally(() => {
              cleanupStore()
              busy.current = false
            })
        } catch (error) {
          cleanupStore()
          if (started) {
            busy.current = false
          }
          request.finish(
            started
              ? new Error('browser_import_hint_effect_unknown')
              : error instanceof Error
                ? error
                : new Error('browser_import_hint_failed')
          )
        }
      })
    }
    window.addEventListener(BROWSER_IMPORT_HINT_EVENT, receive)
    return () => {
      mounted.current = false
      window.removeEventListener(BROWSER_IMPORT_HINT_EVENT, receive)
    }
  }, [])
}
