import {
  browserContextMenuButtons as buttons,
  snapshotBrowserContextMenu as snapshot
} from './browser-context-menu-snapshot'
import type { BrowserContextClipboardSource } from './use-browser-context-menu-clipboard'
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import {
  BROWSER_CONTEXT_MENU_COMMAND_EVENT,
  type BrowserContextMenuEvent
} from '@/runtime/browser-context-menu-request'
import type { BrowserContextLinkTabState } from '../../../../../shared/rpc-contract/browser-context-menu-params'
import type { BrowserPageContextMenuState } from '../describe-page/browser-page-types'
type Owner = {
  page: string
  active: boolean
  menu: BrowserPageContextMenuState | null
  ref: RefObject<HTMLDivElement | null>
  inspect: (verified?: boolean) => Promise<boolean>
  openLink: (verified?: boolean) => void | BrowserContextLinkTabState
  copy: (source: BrowserContextClipboardSource, verified?: boolean) => void | Promise<boolean>
  openExternal: (source: 'link' | 'page', verified?: boolean) => void | Promise<void>
  close: () => void
}
export function useBrowserContextMenuCommands(owner: Owner): void {
  const current = useRef(owner)
  const pending = useRef<{
    request: BrowserContextMenuEvent
    ready: boolean
    copied: boolean
    devToolsRequested?: true
    linkTab?: BrowserContextLinkTabState
    external: boolean
    navigation: boolean
  } | null>(null)
  const [, update] = useState(0)
  useLayoutEffect(() => {
    current.current = owner
  })
  useEffect(() => {
    const operation = pending.current
    if (!operation) {
      return
    }
    if (operation.request.isSettled()) {
      pending.current = null
      return
    }
    if (!owner.active || Date.now() >= operation.request.expiresAt) {
      operation.request.finish(new Error('browser_context_menu_owner_changed_effect_unknown'))
      pending.current = null
    } else if (operation.ready && owner.menu === null && owner.ref.current === null) {
      operation.request.finish(undefined, {
        ...snapshot(owner),
        guestFocusRequested: true,
        ...(operation.devToolsRequested
          ? { devToolsRequested: true as const, devToolsWindowVerified: false as const }
          : {}),
        ...(operation.linkTab ? { linkTab: operation.linkTab } : {}),
        ...(operation.external
          ? { externalOpened: true as const, externalWindowVerified: false as const }
          : {}),
        ...(operation.copied ? { clipboardWritten: true as const } : {}),
        ...(operation.navigation ? { navigationRequested: true as const } : {})
      })
      pending.current = null
    }
  })
  useEffect(() => {
    const receive = (event: WindowEventMap['orca:browser-context-menu-command']): void => {
      const request = event.detail
      if (request.page !== owner.page || !request.claim()) {
        return
      }
      const before = current.current
      if (Date.now() >= request.expiresAt) {
        request.finish(new Error('request_expired'))
        return
      }
      if (!before.active) {
        request.finish(new Error('browser_context_menu_inactive'))
        return
      }
      if (request.action === 'status') {
        request.finish(undefined, snapshot(before))
        return
      }
      if (pending.current && !pending.current.request.isSettled()) {
        request.finish(new Error('browser_context_menu_busy'))
        return
      }
      const menu = before.menu
      if (!menu || !before.ref.current) {
        request.finish(new Error('browser_context_menu_not_open'))
        return
      }
      if (request.action === 'inspect') {
        const operation = {
          request,
          ready: false,
          copied: false,
          navigation: false,
          external: false,
          devToolsRequested: true as const
        }
        pending.current = operation
        void before.inspect(true).then(
          () => {
            if (pending.current === operation && !request.isSettled()) {
              operation.ready = true
              update((value) => value + 1)
            }
          },
          (error: unknown) => {
            request.finish(
              error instanceof Error
                ? error
                : new Error('browser_context_menu_inspect_failed_effect_unknown')
            )
            if (pending.current === operation) {
              pending.current = null
            }
          }
        )
        return
      }
      if (request.action === 'open-link') {
        try {
          const linkTab = before.openLink(true)
          if (!linkTab) {
            throw new Error('browser_context_menu_link_creation_unverifiable')
          }
          const operation = {
            request,
            ready: true,
            copied: false,
            navigation: false,
            external: false,
            linkTab
          }
          pending.current = operation
          update((value) => value + 1)
        } catch (error) {
          request.finish(
            error instanceof Error
              ? error
              : new Error('browser_context_menu_link_creation_effect_unknown')
          )
        }
        return
      }
      if (request.action === 'open-link-external' || request.action === 'open-page-external') {
        if (request.action === 'open-link-external' && !menu.linkUrl) {
          request.finish(new Error('browser_context_menu_action_unavailable'))
          return
        }
        const operation = {
          request,
          ready: false,
          copied: false,
          navigation: false,
          external: true
        }
        pending.current = operation
        Promise.resolve(
          before.openExternal(request.action === 'open-link-external' ? 'link' : 'page', true)
        ).then(
          () => {
            if (pending.current === operation && !request.isSettled()) {
              operation.ready = true
              update((value) => value + 1)
            }
          },
          (error: unknown) => {
            request.finish(
              error instanceof Error
                ? error
                : new Error('browser_context_menu_external_failed_effect_unknown')
            )
            if (pending.current === operation) {
              pending.current = null
            }
          }
        )
        return
      }
      const key =
        request.action === 'next'
          ? 'ArrowDown'
          : request.action === 'previous'
            ? 'ArrowUp'
            : request.action === 'first'
              ? 'Home'
              : request.action === 'last'
                ? 'End'
                : null
      if (key) {
        const items = buttons(before)
        const index =
          document.activeElement instanceof HTMLButtonElement
            ? items.indexOf(document.activeElement)
            : -1
        const target =
          key === 'Home'
            ? items[0]
            : key === 'End'
              ? items.at(-1)
              : key === 'ArrowDown'
                ? items[(index + 1) % items.length]
                : items[(index <= 0 ? items.length : index) - 1]
        before.ref.current.dispatchEvent(
          new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
        )
        request.finish(
          target && document.activeElement === target
            ? undefined
            : new Error('browser_context_menu_focus_not_applied'),
          snapshot(before)
        )
        return
      }
      const copy =
        request.action === 'copy-link' ||
        request.action === 'copy-page-url' ||
        request.action === 'copy-selection'
      const button =
        request.action === 'close'
          ? null
          : buttons(before).find((item) => item.dataset.browserContextAction === request.action)
      if (request.action !== 'close' && !button) {
        request.finish(new Error('browser_context_menu_action_unavailable'))
        return
      }
      const operation = {
        request,
        ready: !copy,
        copied: false,
        external: false,
        navigation: ['back', 'forward', 'reload'].includes(request.action)
      }
      pending.current = operation
      try {
        if (request.action === 'close') {
          before.close()
        } else if (!copy) {
          button?.click()
        }
        if (copy) {
          const source =
            request.action === 'copy-link'
              ? 'link'
              : request.action === 'copy-page-url'
                ? 'page'
                : 'selection'
          void Promise.resolve(before.copy(source, true)).then(
            (value) => {
              if (pending.current !== operation || request.isSettled()) {
                return
              }
              if (value !== true || Date.now() >= request.expiresAt) {
                request.finish(
                  new Error('browser_context_menu_clipboard_unverifiable_effect_unknown')
                )
                pending.current = null
                return
              }
              operation.ready = true
              operation.copied = true
              update((value) => value + 1)
            },
            () => {
              request.finish(
                new Error('browser_context_menu_clipboard_unverifiable_effect_unknown')
              )
              if (pending.current === operation) {
                pending.current = null
              }
            }
          )
        } else {
          update((value) => value + 1)
        }
      } catch {
        request.finish(new Error('browser_context_menu_action_failed_effect_unknown'))
        if (pending.current === operation) {
          pending.current = null
        }
      }
    }
    window.addEventListener(BROWSER_CONTEXT_MENU_COMMAND_EVENT, receive)
    return () => window.removeEventListener(BROWSER_CONTEXT_MENU_COMMAND_EVENT, receive)
  }, [owner.page])
  useEffect(
    () => () => {
      pending.current?.request.finish(new Error('browser_context_menu_unavailable_effect_unknown'))
      pending.current = null
    },
    [owner.page]
  )
}
