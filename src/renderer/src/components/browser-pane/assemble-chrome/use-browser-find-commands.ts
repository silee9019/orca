import { useAppStore } from '@/store'
import { isBrowserClientPageViewerTargetCurrent } from '@/runtime/browser-client-page-viewer-target'
import type { BrowserClientNavigationTarget } from '../../../../../shared/rpc-contract/browser-client-navigation-params'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { isFindQueryTooLarge } from '@/lib/find-query-bounds'
import {
  BROWSER_FIND_COMMAND_EVENT,
  type BrowserFindEvent,
  type BrowserFindState
} from '@/runtime/browser-find-request'

export type BrowserFindCommandOwner = {
  active: boolean
  clientTarget?: BrowserClientNavigationTarget
}
type Props = {
  commandOwner?: BrowserFindCommandOwner
  page?: string
  state: BrowserFindState
  open?: () => void
  close: () => void
  setQuery: (query: string) => void
  next: () => boolean
  previous: () => boolean
}
export function useBrowserFindCommands({
  page,
  commandOwner,
  state,
  open,
  close,
  setQuery,
  next,
  previous
}: Props): void {
  const hasClientTarget = commandOwner?.clientTarget !== undefined
  const pending = useRef<BrowserFindEvent | null>(null)
  const currentOwner = useRef(commandOwner)
  const clientEpoch = useRef(0)
  useLayoutEffect(() => {
    currentOwner.current = commandOwner
  })
  useLayoutEffect(() => {
    if (!currentOwner.current?.clientTarget) {
      return
    }
    const unsubscribe = useAppStore.subscribe(() => {
      const target = currentOwner.current?.clientTarget
      if (target && !isBrowserClientPageViewerTargetCurrent(target)) {
        clientEpoch.current += 1
        if (pending.current?.clientTarget) {
          pending.current.finish(new Error('browser_client_find_owner_changed_effect_unknown'))
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
    const request = pending.current
    if (!request) {
      return
    }
    const ready =
      request.action === 'close'
        ? !state.open
        : state.open && (request.action !== 'query' || request.query === state.query)
    if (ready) {
      pending.current = null
      request.finish(undefined, state)
    }
  }, [state, commandOwner])
  useEffect(() => {
    const receive = (event: WindowEventMap['orca:browser-find-command']): void => {
      const request = event.detail
      if (request.page !== page) {
        return
      }
      if (request.clientTarget) {
        if (
          !commandOwner?.active ||
          !commandOwner.clientTarget ||
          Object.entries(request.clientTarget).some(
            ([key, value]) => Reflect.get(commandOwner.clientTarget ?? {}, key) !== value
          ) ||
          !isBrowserClientPageViewerTargetCurrent(request.clientTarget)
        ) {
          return
        }
      } else if (commandOwner?.clientTarget || !request.claim()) {
        return
      }
      const offeredEpoch = clientEpoch.current
      const acknowledge = (observed: BrowserFindState): void => {
        if (request.clientTarget && offeredEpoch !== clientEpoch.current) {
          request.finish(new Error('browser_client_find_owner_changed_effect_unknown'))
        } else {
          request.finish(undefined, observed)
        }
      }
      const perform = (): void => {
        if (
          request.clientTarget &&
          (offeredEpoch !== clientEpoch.current ||
            !isBrowserClientPageViewerTargetCurrent(request.clientTarget))
        ) {
          request.finish(new Error('browser_client_find_owner_changed_effect_unknown'))
          return
        }
        if (Date.now() >= request.expiresAt) {
          request.finish(new Error('request_expired'))
          return
        }
        if (pending.current?.isSettled()) {
          pending.current = null
        }
        if (pending.current) {
          request.finish(new Error('browser_find_busy'))
          return
        }
        if (request.action === 'status') {
          acknowledge(state)
          return
        }
        if (request.action === 'next' || request.action === 'previous') {
          if (!state.open) {
            request.finish(new Error('browser_find_not_open'))
          } else if (!(request.action === 'next' ? next() : previous())) {
            request.finish(new Error('browser_find_guest_unavailable'))
          } else {
            acknowledge(state)
          }
          return
        }
        if (
          request.action === 'query' &&
          (request.query === undefined || isFindQueryTooLarge(request.query))
        ) {
          request.finish(new Error('invalid_find_query'))
          return
        }
        if (request.action !== 'close' && !open) {
          request.finish(new Error('browser_find_ui_unavailable'))
          return
        }
        if (
          (request.action === 'open' && state.open) ||
          (request.action === 'close' && !state.open) ||
          (request.action === 'query' && state.open && request.query === state.query)
        ) {
          acknowledge(state)
          return
        }
        pending.current = request
        if (request.action === 'close') {
          close()
        } else {
          if (request.action === 'query' && request.query !== undefined) {
            setQuery(request.query)
          }
          open?.()
        }
      }
      if (request.clientTarget) {
        request.offer(perform)
      } else {
        perform()
      }
    }
    window.addEventListener(BROWSER_FIND_COMMAND_EVENT, receive)
    return () => window.removeEventListener(BROWSER_FIND_COMMAND_EVENT, receive)
  }, [page, state, open, close, setQuery, next, previous, commandOwner])
  useEffect(
    () => () => {
      pending.current?.finish(new Error('browser_find_ui_unavailable'))
      pending.current = null
    },
    []
  )
}
