import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { BrowserMarkupEditorOwner } from '@/runtime/browser-markup-editor-request'
import {
  BROWSER_MARKUP_HINT_COMMAND_EVENT,
  type BrowserMarkupHintEvent
} from '@/runtime/browser-markup-hint-request'
export function useBrowserMarkupHintCommands(
  commandOwner: BrowserMarkupEditorOwner | undefined,
  hintOpen: boolean,
  active: boolean,
  disabled: boolean,
  dismissHint: () => void,
  startMarkup: () => void
): void {
  const current = useRef({ commandOwner, hintOpen, active, disabled, dismissHint, startMarkup })
  const pending = useRef<{
    request: BrowserMarkupHintEvent
    active: boolean
    isCurrent?: () => boolean
  } | null>(null)
  const [, update] = useState(0)
  useLayoutEffect(() => {
    current.current = { commandOwner, hintOpen, active, disabled, dismissHint, startMarkup }
  })
  const snapshot = (request: BrowserMarkupHintEvent) => ({
    page: request.page,
    action: request.action,
    hintOpen,
    active,
    disabled,
    accepted: true as const
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
    if (
      !commandOwner?.active ||
      !!commandOwner.clientTarget ||
      commandOwner.page !== operation.request.page ||
      commandOwner.isCurrent?.() === false ||
      operation.isCurrent?.() === false ||
      Date.now() >= operation.request.expiresAt
    ) {
      operation.request.finish(new Error('browser_markup_hint_owner_changed_effect_unknown'))
    } else {
      operation.request.finish(
        !hintOpen && active === operation.active
          ? undefined
          : new Error('browser_markup_hint_not_applied'),
        snapshot(operation.request)
      )
    }
  })
  useEffect(() => {
    const receive = (event: WindowEventMap['orca:browser-markup-hint-command']): void => {
      const request = event.detail
      const owner = current.current
      if (owner.commandOwner?.page !== request.page || owner.commandOwner.clientTarget) {
        return
      }
      request.offer(owner.commandOwner.active && owner.commandOwner.isCurrent?.() !== false, () => {
        const owner = current.current
        if (
          !owner.commandOwner?.active ||
          !!owner.commandOwner.clientTarget ||
          owner.commandOwner.page !== request.page ||
          owner.commandOwner.isCurrent?.() === false
        ) {
          request.finish(new Error('browser_markup_hint_owner_changed_effect_unknown'))
          return
        }
        if (Date.now() >= request.expiresAt) {
          request.finish(new Error('request_expired'))
          return
        }
        const state = {
          page: request.page,
          action: request.action,
          hintOpen: owner.hintOpen,
          active: owner.active,
          disabled: owner.disabled,
          accepted: true as const
        }
        if (request.action === 'status') {
          request.finish(undefined, state)
          return
        }
        if (request.action === 'toggle' && owner.disabled) {
          request.finish(new Error('browser_markup_hint_disabled'))
          return
        }
        if (pending.current && !pending.current.request.isSettled()) {
          request.finish(new Error('browser_markup_hint_busy'))
          return
        }
        pending.current = {
          request,
          active: request.action === 'toggle' ? !owner.active : owner.active,
          isCurrent: owner.commandOwner.isCurrent
        }
        try {
          if (request.action === 'toggle') {
            owner.startMarkup()
          } else {
            owner.dismissHint()
          }
          update((value) => value + 1)
        } catch {
          pending.current = null
          request.finish(new Error('browser_markup_hint_failed_effect_unknown'))
        }
      })
    }
    window.addEventListener(BROWSER_MARKUP_HINT_COMMAND_EVENT, receive)
    return () => window.removeEventListener(BROWSER_MARKUP_HINT_COMMAND_EVENT, receive)
  }, [])
  useEffect(
    () => () => {
      pending.current?.request.finish(new Error('browser_markup_hint_unavailable_effect_unknown'))
      pending.current = null
    },
    [commandOwner?.page]
  )
}
