import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import {
  BROWSER_RELOAD_MENU_COMMAND_EVENT,
  type BrowserReloadMenuEvent
} from '@/runtime/browser-reload-menu-request'
export function useBrowserReloadMenuCommands(
  page: string,
  active: boolean,
  open: boolean,
  setOpen: Dispatch<SetStateAction<boolean>>
): void {
  const current = useRef({ page, active, open, setOpen })
  const pending = useRef<{ request: BrowserReloadMenuEvent; open: boolean } | null>(null)
  const [, update] = useState(0)
  useLayoutEffect(() => {
    current.current = { page, active, open, setOpen }
  })
  useEffect(() => {
    const operation = pending.current
    if (!operation) {
      return
    }
    pending.current = null
    if (operation.request.isSettled()) {
      return
    }
    if (!active || page !== operation.request.page || Date.now() >= operation.request.expiresAt) {
      operation.request.finish(new Error('browser_reload_menu_owner_changed_effect_unknown'))
    } else {
      operation.request.finish(
        open === operation.open ? undefined : new Error('browser_reload_menu_not_applied'),
        { open }
      )
    }
  })
  useEffect(() => {
    const receive = (event: WindowEventMap['orca:browser-reload-menu-command']): void => {
      const request = event.detail
      const owner = current.current
      if (owner.page !== request.page) {
        return
      }
      request.offer(owner.active, () => {
        const owner = current.current
        if (!owner.active || owner.page !== request.page) {
          request.finish(new Error('browser_reload_menu_owner_changed_effect_unknown'))
          return
        }
        if (Date.now() >= request.expiresAt) {
          request.finish(new Error('request_expired'))
          return
        }
        if (request.action === 'status') {
          request.finish(undefined, { open: owner.open })
          return
        }
        if (pending.current && !pending.current.request.isSettled()) {
          request.finish(new Error('browser_reload_menu_busy'))
          return
        }
        try {
          const open = request.action === 'open'
          pending.current = { request, open }
          owner.setOpen(open)
          update((value) => value + 1)
        } catch {
          pending.current = null
          request.finish(new Error('browser_reload_menu_failed_effect_unknown'))
        }
      })
    }
    window.addEventListener(BROWSER_RELOAD_MENU_COMMAND_EVENT, receive)
    return () => window.removeEventListener(BROWSER_RELOAD_MENU_COMMAND_EVENT, receive)
  }, [])
  useEffect(
    () => () => {
      pending.current?.request.finish(new Error('browser_reload_menu_unavailable_effect_unknown'))
      pending.current = null
    },
    [page]
  )
}
