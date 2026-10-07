import { useEffect, useRef } from 'react'
import { isFindQueryTooLarge } from '@/lib/find-query-bounds'
import {
  BROWSER_FIND_COMMAND_EVENT,
  type BrowserFindEvent,
  type BrowserFindState
} from '@/runtime/browser-find-request'

type Props = {
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
  state,
  open,
  close,
  setQuery,
  next,
  previous
}: Props): void {
  const pending = useRef<BrowserFindEvent | null>(null)
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
  }, [state])
  useEffect(() => {
    const receive = (event: WindowEventMap['orca:browser-find-command']): void => {
      const request = event.detail
      if (request.page !== page) {
        return
      }
      if (!request.claim()) {
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
        request.finish(undefined, state)
        return
      }
      if (request.action === 'next' || request.action === 'previous') {
        if (!state.open) {
          request.finish(new Error('browser_find_not_open'))
        } else if (!(request.action === 'next' ? next() : previous())) {
          request.finish(new Error('browser_find_guest_unavailable'))
        } else {
          request.finish(undefined, state)
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
        request.finish(undefined, state)
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
    window.addEventListener(BROWSER_FIND_COMMAND_EVENT, receive)
    return () => window.removeEventListener(BROWSER_FIND_COMMAND_EVENT, receive)
  }, [page, state, open, close, setQuery, next, previous])
  useEffect(
    () => () => {
      pending.current?.finish(new Error('browser_find_ui_unavailable'))
      pending.current = null
    },
    []
  )
}
