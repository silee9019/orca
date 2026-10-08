import { useAppStore } from '@/store'
import { isBrowserClientPageViewerTargetCurrent } from '@/runtime/browser-client-page-viewer-target'
import type { BrowserClientAddressTarget } from '../../../../../shared/rpc-contract/browser-client-address-params'
import { requestBrowserChromeAddressFocus } from '@/runtime/browser-chrome-focus-request'
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import {
  BROWSER_ADDRESS_COMMAND_EVENT,
  type BrowserAddressEvent
} from '@/runtime/browser-address-request'
import { redactKagiSessionToken } from '../../../../../shared/browser-url'
import type { BrowserAddressState } from '../../../../../shared/rpc-contract/browser-address-params'
import { isBrowserAddressBarQueryTooLarge } from './browser-address-bar-suggestions'
import type { BrowserAddressBarSuggestion } from './browser-address-bar-suggestions'
export type BrowserAddressController = {
  value: string
  open: boolean
  selectedValue: string
  suggestions: BrowserAddressBarSuggestion[]
  inputRef: RefObject<HTMLInputElement | null>
  focus: () => void
  blur: () => void
  change: (value: string) => void
  dismiss: () => void
  highlight: (url: string) => void
  preview: (index: number) => void
  select: (url: string) => void
  submit: () => void
}
function snapshot(controller: BrowserAddressController): BrowserAddressState {
  return {
    value: redactKagiSessionToken(controller.value),
    open: controller.open,
    focused:
      controller.inputRef.current !== null &&
      document.activeElement === controller.inputRef.current,
    selectedIndex: controller.suggestions.findIndex((row) => row.url === controller.selectedValue),
    suggestions: controller.suggestions.map((row, index) => ({
      index,
      url: redactKagiSessionToken(row.url),
      title: row.title,
      kind: row.docLocation ? 'workspace-doc' : row.isSearch ? 'search' : 'history'
    }))
  }
}
export type BrowserAddressCommandOwner = {
  page: string
  active: boolean
  clientTarget?: BrowserClientAddressTarget
}
export function useBrowserAddressCommands(
  owner: BrowserAddressCommandOwner | undefined,
  controller: BrowserAddressController
): void {
  const current = useRef(controller)
  const clientEpoch = useRef(0)
  const currentOwner = useRef(owner)
  const pending = useRef<{
    request: BrowserAddressEvent
    check: (value: BrowserAddressController) => boolean
    navigation: boolean
    waitForBlur: boolean
    chromeFocus: boolean
  } | null>(null)
  const [, update] = useState(0)
  useLayoutEffect(() => {
    current.current = controller
    currentOwner.current = owner
  })
  const hasClientTarget = owner?.clientTarget !== undefined
  useLayoutEffect(() => {
    if (!currentOwner.current?.clientTarget) {
      return
    }
    const unsubscribe = useAppStore.subscribe(() => {
      const target = currentOwner.current?.clientTarget
      if (target && !isBrowserClientPageViewerTargetCurrent(target)) {
        clientEpoch.current += 1
        if (pending.current?.request.clientTarget) {
          pending.current.request.finish(
            new Error('browser_client_address_owner_changed_effect_unknown')
          )
          pending.current = null
        }
      }
    })
    return () => {
      clientEpoch.current += 1
      unsubscribe()
    }
  }, [hasClientTarget])
  useEffect(() => {
    const operation = pending.current
    if (!operation) {
      return
    }
    if (!operation.request.isSettled()) {
      if (Date.now() >= operation.request.expiresAt) {
        operation.request.finish(new Error('request_expired'))
        pending.current = null
        return
      }
      if (
        operation.request.clientTarget &&
        !isBrowserClientPageViewerTargetCurrent(operation.request.clientTarget)
      ) {
        operation.request.finish(new Error('browser_client_address_owner_changed_effect_unknown'))
        pending.current = null
        return
      }
      if (operation.waitForBlur && owner?.active && current.current.open) {
        return
      }
      const accepted = !!owner?.active && operation.check(current.current)
      operation.request.finish(
        accepted ? undefined : new Error('browser_address_edit_not_applied_effect_unknown'),
        {
          ...snapshot(current.current),
          ...(operation.chromeFocus
            ? {
                chromeFocusOwnerInvoked: true as const,
                selection: {
                  start: current.current.inputRef.current?.selectionStart ?? null,
                  end: current.current.inputRef.current?.selectionEnd ?? null
                }
              }
            : {}),
          ...(operation.navigation ? { navigationRequested: true } : {})
        }
      )
    }
    pending.current = null
  })
  useEffect(() => {
    const receive = (event: WindowEventMap['orca:browser-address-command']): void => {
      const request = event.detail
      if (!owner || request.page !== owner.page) {
        return
      }
      if (request.clientTarget) {
        if (
          !owner.active ||
          !owner.clientTarget ||
          Object.entries(request.clientTarget).some(
            ([key, value]) => Reflect.get(owner.clientTarget ?? {}, key) !== value
          ) ||
          !isBrowserClientPageViewerTargetCurrent(request.clientTarget)
        ) {
          return
        }
      } else if (owner.clientTarget || !request.claim()) {
        return
      }
      const offeredEpoch = clientEpoch.current
      const perform = (): void => {
        if (request.clientTarget && offeredEpoch !== clientEpoch.current) {
          request.finish(new Error('browser_client_address_owner_changed_effect_unknown'))
          return
        }
        if (request.clientTarget && !isBrowserClientPageViewerTargetCurrent(request.clientTarget)) {
          request.finish(new Error('browser_client_address_target_changed'))
          return
        }
        if (Date.now() >= request.expiresAt) {
          request.finish(new Error('request_expired'))
          return
        }
        if (!owner.active) {
          request.finish(new Error('browser_address_viewer_inactive'))
          return
        }
        const before = current.current
        const command = request.command
        if (command.action === 'status') {
          request.finish(undefined, snapshot(before))
          return
        }
        if (pending.current && !pending.current.request.isSettled()) {
          request.finish(new Error('browser_address_busy'))
          return
        }
        if (!before.inputRef.current) {
          request.finish(new Error('browser_address_input_unavailable'))
          return
        }
        let check: (value: BrowserAddressController) => boolean
        let navigation = false
        let waitForBlur = false
        let chromeFocus = false
        try {
          if (command.action === 'focus') {
            const applied = requestBrowserChromeAddressFocus(owner.page)
            if (applied !== true) {
              request.finish(
                new Error(
                  applied === 'unavailable'
                    ? 'browser_address_chrome_focus_unavailable'
                    : 'browser_address_chrome_focus_failed_effect_unknown'
                )
              )
              return
            }
            chromeFocus = true
            check = (value) =>
              value.open &&
              document.activeElement === value.inputRef.current &&
              value.inputRef.current?.selectionStart === 0 &&
              value.inputRef.current.selectionEnd === value.inputRef.current.value.length
          } else if (command.action === 'open') {
            before.inputRef.current.focus()
            before.focus()
            check = (value) => value.open && document.activeElement === value.inputRef.current
          } else if (command.action === 'draft') {
            if (isBrowserAddressBarQueryTooLarge(command.text)) {
              request.finish(new Error('browser_address_query_too_large'))
              return
            }
            before.inputRef.current.focus()
            before.focus()
            before.change(command.text)
            check = (value) => value.open && value.value === command.text
          } else if (command.action === 'next' || command.action === 'previous') {
            if (!before.open || before.suggestions.length === 0) {
              request.finish(new Error('browser_address_suggestion_unavailable'))
              return
            }
            before.inputRef.current.dispatchEvent(
              new KeyboardEvent('keydown', {
                key: command.action === 'next' ? 'ArrowDown' : 'ArrowUp',
                bubbles: true,
                cancelable: true
              })
            )
            check = (value) => value.open && value.suggestions.length > 0
          } else if (command.action === 'blur') {
            if (document.activeElement === before.inputRef.current) {
              before.inputRef.current.blur()
            } else {
              before.blur()
            }
            waitForBlur = true
            check = (value) => !value.open && document.activeElement !== value.inputRef.current
          } else if (command.action === 'dismiss') {
            before.dismiss()
            check = (value) => !value.open
          } else if (command.action === 'submit') {
            before.submit()
            navigation = true
            check = (value) => !value.open
          } else if (
            command.action === 'preview' ||
            command.action === 'select' ||
            command.action === 'highlight'
          ) {
            const suggestion = before.suggestions[command.index]
            if (!before.open || !suggestion) {
              request.finish(new Error('browser_address_suggestion_unavailable'))
              return
            }
            if (command.action === 'highlight') {
              before.highlight(suggestion.url)
              check = (value) =>
                value.selectedValue === suggestion.url && value.value === before.value
            } else if (command.action === 'preview') {
              before.preview(command.index)
              check = (value) =>
                value.suggestions.findIndex((row) => row.url === value.selectedValue) ===
                command.index
            } else {
              before.select(suggestion.url)
              navigation = true
              check = (value) => !value.open
            }
          } else {
            request.finish(new Error('invalid_browser_address_action'))
            return
          }
          pending.current = { request, check, navigation, waitForBlur, chromeFocus }
          update((value) => value + 1)
        } catch {
          request.finish(new Error('browser_address_action_failed_effect_unknown'))
        }
      }
      if (request.clientTarget) {
        request.offer(perform)
      } else {
        perform()
      }
    }
    window.addEventListener(BROWSER_ADDRESS_COMMAND_EVENT, receive)
    return () => window.removeEventListener(BROWSER_ADDRESS_COMMAND_EVENT, receive)
  }, [owner])
  useEffect(
    () => () => {
      pending.current?.request.finish(new Error('browser_address_ui_unavailable'))
      pending.current = null
    },
    [owner?.page]
  )
}
