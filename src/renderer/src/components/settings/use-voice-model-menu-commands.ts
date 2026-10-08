import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { isPairedWebClientWindow } from '@/lib/desktop-window-chrome'
import { requireHostViewer } from '@/runtime/voice-viewer-target'
import {
  VOICE_MODEL_MENU_EVENT,
  type VoiceModelMenuEvent
} from '@/runtime/voice-model-menu-request'

function requireVoiceModelMenuSurface(): void {
  const state = requireHostViewer()
  if (
    isPairedWebClientWindow() ||
    state.activeView !== 'settings' ||
    state.activeModal !== 'none' ||
    document.querySelector('[data-voice-settings-pane]') === null
  ) {
    throw new Error('voice_model_menu_surface_inactive')
  }
}
export function useVoiceModelMenuCommands(
  open: boolean,
  enabled: boolean,
  setOpen: (open: boolean) => void
): void {
  const [, update] = useState(0)
  const lifetimeEpoch = useRef(0)
  const current = useRef({ open, enabled, setOpen })
  const pending = useRef<{
    request: VoiceModelMenuEvent
    open: boolean | null
    cleanup: () => void
  } | null>(null)
  useLayoutEffect(() => {
    current.current = { open, enabled, setOpen }
  })
  useEffect(() => {
    const operation = pending.current
    if (!operation) {
      return
    }
    try {
      requireVoiceModelMenuSurface()
      if (Date.now() >= operation.request.expiresAt || operation.request.isSettled()) {
        throw new Error('voice_model_menu_request_expired_effect_unknown')
      }
      if (
        operation.open === true &&
        (!current.current.enabled || useAppStore.getState().settings?.voice?.enabled !== true)
      ) {
        throw new Error('voice_model_menu_disabled_effect_unknown')
      }
      if (operation.open !== null && open !== operation.open) {
        return
      }
      operation.request.finish(undefined, open)
    } catch {
      operation.request.finish(new Error('voice_model_menu_changed_effect_unknown'))
    }
    operation.cleanup()
    pending.current = null
  })
  useEffect(() => {
    let mounted = true
    let previousEnabled = useAppStore.getState().settings?.voice?.enabled
    const unsubscribeLifetime = useAppStore.subscribe(() => {
      const enabledNow = useAppStore.getState().settings?.voice?.enabled
      try {
        requireVoiceModelMenuSurface()
      } catch {
        lifetimeEpoch.current += 1
      }
      if (enabledNow !== previousEnabled) {
        lifetimeEpoch.current += 1
      }
      previousEnabled = enabledNow
    })
    const receive = (event: WindowEventMap['orca:voice-model-menu-command']): void => {
      const request = event.detail
      const offeredEpoch = lifetimeEpoch.current
      request.offer(() => {
        try {
          if (!mounted || lifetimeEpoch.current !== offeredEpoch) {
            throw new Error('voice_model_menu_offer_changed')
          }
          requireVoiceModelMenuSurface()
          if (Date.now() >= request.expiresAt || request.isSettled() || pending.current) {
            throw new Error('voice_model_menu_busy_or_expired')
          }
          const before = current.current
          const next = request.action === 'open'
          if (
            next &&
            (!before.enabled || useAppStore.getState().settings?.voice?.enabled !== true)
          ) {
            throw new Error('voice_model_menu_disabled')
          }
          const unsubscribe = useAppStore.subscribe(() => {
            try {
              requireVoiceModelMenuSurface()
              if (next && useAppStore.getState().settings?.voice?.enabled !== true) {
                throw new Error('voice_model_menu_disabled_effect_unknown')
              }
            } catch {
              request.finish(new Error('voice_model_menu_changed_effect_unknown'))
              pending.current?.cleanup()
              pending.current = null
            }
          })
          const timer = window.setTimeout(
            () => {
              unsubscribe()
              if (pending.current?.request === request) {
                pending.current = null
              }
            },
            Math.max(0, request.expiresAt - Date.now())
          )
          pending.current = {
            request,
            open: request.action === 'status' ? null : next,
            cleanup: () => {
              unsubscribe()
              window.clearTimeout(timer)
            }
          }
          if (request.action !== 'status') {
            before.setOpen(next)
          }
          update((value) => value + 1)
        } catch {
          request.finish(new Error('voice_model_menu_unavailable'))
        }
      })
    }
    window.addEventListener(VOICE_MODEL_MENU_EVENT, receive)
    return () => {
      mounted = false
      lifetimeEpoch.current += 1
      unsubscribeLifetime()
      window.removeEventListener(VOICE_MODEL_MENU_EVENT, receive)
      pending.current?.request.finish(new Error('voice_model_menu_unmounted_effect_unknown'))
      pending.current?.cleanup()
      pending.current = null
    }
  }, [])
}
