import { useEffectEvent, useLayoutEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import {
  BrowserClientInputFeedbackEvent,
  resolveClientInputFeedback
} from '@/runtime/browser-client-input-feedback-request'
import {
  isBrowserClientDocumentSourceCurrent,
  matchesBrowserClientDocumentSourceHandle
} from '@/runtime/browser-client-document-source'
import type { RemoteBrowserPageHandle } from '@/store/slices/browser/browser-slice-contract'
import type { RuntimeBrowserClientPlacement } from '../../../../../shared/runtime-browser-placement'
import type { BrowserClientInputFeedbackState } from '../../../../../shared/rpc-contract/browser-client-input-feedback-params'
export function useClientHostedInputFeedbackCommands(params: {
  page: string
  worktreeId: string
  environmentId: string
  placement: RuntimeBrowserClientPlacement | null
  isActive: boolean
  unavailable: boolean
  navigate: (value: string) => void
}): void {
  const epoch = useRef(0)
  const offeredSource = useRef<BrowserClientInputFeedbackEvent['command']['source'] | null>(null)
  const offeredHandle = useRef<RemoteBrowserPageHandle | undefined>(undefined)
  const pending = useRef<{ check: () => void; finish: (error?: Error) => void } | null>(null)
  const busy = useRef(false)
  const [, update] = useState(0)
  const receive = useEffectEvent((event: BrowserClientInputFeedbackEvent) => {
    const source = event.command.source
    const { target } = source
    if (
      target.page !== params.page ||
      target.worktreeId !== params.worktreeId ||
      target.environmentId !== params.environmentId
    ) {
      return
    }
    offeredSource.current = source
    offeredHandle.current = useAppStore.getState().remoteBrowserPageHandlesByPageId[target.page]
    const offeredEpoch = epoch.current
    event.offers.push(
      () =>
        new Promise<BrowserClientInputFeedbackState>((resolve, reject) => {
          let acquired = false
          let settled = false
          let timer: ReturnType<typeof setTimeout> | undefined
          const expected = resolveClientInputFeedback(event.command)
          const check = () => {
            if (
              epoch.current !== offeredEpoch ||
              !params.isActive ||
              params.unavailable ||
              !isBrowserClientDocumentSourceCurrent(source, params.placement) ||
              !matchesBrowserClientDocumentSourceHandle(
                source,
                useAppStore.getState().remoteBrowserPageHandlesByPageId[target.page],
                params.placement,
                offeredHandle.current
              )
            ) {
              throw new Error('browser_client_input_feedback_owner_changed')
            }
            if (Date.now() >= event.expiresAt) {
              throw new Error('browser_client_input_feedback_expired')
            }
          }
          const finish = (error?: Error) => {
            if (settled) {
              return
            }
            settled = true
            clearTimeout(timer)
            if (pending.current?.finish === finish) {
              pending.current = null
            }
            if (acquired) {
              busy.current = false
            }
            if (error) {
              reject(error)
              return
            }
            try {
              check()
              const page = Object.values(useAppStore.getState().browserPagesByWorkspace)
                .flat()
                .find((page) => page.id === target.page)
              if (
                page?.loadError?.code !== 0 ||
                page.loadError.description !== expected.description ||
                page.loadError.validatedUrl !== expected.validatedUrl
              ) {
                throw new Error('browser_client_input_feedback_not_applied')
              }
              resolve({
                source,
                inputRejected: true,
                kind: event.command.value.trim().toLowerCase().startsWith('file:')
                  ? 'local-file'
                  : 'invalid',
                loadErrorCode: 0,
                navigationStarted: false
              })
            } catch (error) {
              reject(
                error instanceof Error ? error : new Error('browser_client_input_feedback_failed')
              )
            }
          }
          try {
            check()
            if (busy.current) {
              throw new Error('browser_client_input_feedback_busy')
            }
            busy.current = true
            acquired = true
            pending.current = { check, finish }
            timer = setTimeout(
              () => finish(new Error('browser_client_input_feedback_expired')),
              Math.max(0, event.expiresAt - Date.now())
            )
            params.navigate(event.command.value)
            check()
            update((value) => value + 1)
          } catch (error) {
            finish(
              error instanceof Error ? error : new Error('browser_client_input_feedback_failed')
            )
          }
        })
    )
  })
  useLayoutEffect(() => {
    pending.current?.finish()
  })
  useLayoutEffect(() => {
    const lifetime = epoch
    const activeTarget = offeredSource
    const activePending = pending
    const unsubscribe = useAppStore.subscribe(() => {
      try {
        if (
          offeredSource.current &&
          (!isBrowserClientDocumentSourceCurrent(offeredSource.current, params.placement) ||
            !matchesBrowserClientDocumentSourceHandle(
              offeredSource.current,
              useAppStore.getState().remoteBrowserPageHandlesByPageId[
                offeredSource.current.target.page
              ],
              params.placement,
              offeredHandle.current
            ))
        ) {
          throw new Error('browser_client_input_feedback_owner_changed')
        }
        pending.current?.check()
      } catch (error) {
        epoch.current++
        pending.current?.finish(
          error instanceof Error ? error : new Error('browser_client_input_feedback_owner_changed')
        )
      }
    })
    const listener = (event: Event) => {
      if (event instanceof BrowserClientInputFeedbackEvent) {
        receive(event)
      }
    }
    window.addEventListener('orca:browser-client-input-feedback', listener)
    return () => {
      lifetime.current++
      unsubscribe()
      activeTarget.current = null
      window.removeEventListener('orca:browser-client-input-feedback', listener)
      activePending.current?.finish(new Error('browser_client_input_feedback_unmounted'))
    }
  }, [params.page, params.worktreeId, params.environmentId, params.placement, params.isActive])
}
