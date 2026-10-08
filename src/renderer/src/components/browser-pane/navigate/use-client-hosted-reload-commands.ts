import { useEffectEvent, useLayoutEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { isBrowserClientPageViewerTargetCurrent } from '@/runtime/browser-client-page-viewer-target'
import {
  BROWSER_CLIENT_RELOAD_EVENT,
  type BrowserClientReloadEvent
} from '@/runtime/browser-client-reload-request'
import type { BrowserAddressCommandOwner } from '../assemble-chrome/use-browser-address-commands'
export function useClientHostedReloadCommands(
  owner: BrowserAddressCommandOwner | undefined,
  reload: () => boolean
): void {
  const currentOwner = useRef(owner)
  const epoch = useRef(0)
  const hasTarget = owner?.clientTarget !== undefined
  useLayoutEffect(() => {
    currentOwner.current = owner
  })
  useLayoutEffect(() => {
    if (!hasTarget) {
      return
    }
    const unsubscribe = useAppStore.subscribe(() => {
      const target = currentOwner.current?.clientTarget
      if (target && !isBrowserClientPageViewerTargetCurrent(target)) {
        epoch.current += 1
      }
    })
    return () => {
      epoch.current += 1
      unsubscribe()
    }
  }, [hasTarget])
  const onCommand = useEffectEvent((request: BrowserClientReloadEvent) => {
    if (
      !owner?.active ||
      !owner.clientTarget ||
      Object.entries(request.target).some(
        ([key, value]) => Reflect.get(owner.clientTarget ?? {}, key) !== value
      ) ||
      !isBrowserClientPageViewerTargetCurrent(request.target)
    ) {
      return
    }
    const offeredEpoch = epoch.current
    request.offer(() => {
      const current = (): boolean => {
        const target = currentOwner.current?.clientTarget
        return (
          offeredEpoch === epoch.current &&
          currentOwner.current?.active === true &&
          target !== undefined &&
          Object.entries(request.target).every(
            ([key, value]) => Reflect.get(target, key) === value
          ) &&
          isBrowserClientPageViewerTargetCurrent(request.target)
        )
      }
      if (!current() || Date.now() >= request.expiresAt) {
        request.finish(new Error('browser_client_reload_owner_changed_effect_unknown'))
        return
      }
      try {
        if (reload() !== true) {
          throw new Error('browser_client_reload_guest_not_ready')
        }
        if (!current()) {
          throw new Error('browser_client_reload_owner_changed_effect_unknown')
        }
        const page = Object.values(useAppStore.getState().browserPagesByWorkspace)
          .flat()
          .find((page) => page.id === request.target.page)
        if (!page) {
          throw new Error('browser_client_reload_owner_changed_effect_unknown')
        }
        request.finish(undefined, {
          target: request.target,
          accepted: true,
          loading: page.loading,
          completionObserved: false
        })
      } catch (error) {
        request.finish(
          error instanceof Error ? error : new Error('browser_client_reload_effect_unknown')
        )
      }
    })
  })
  useLayoutEffect(() => {
    const receive = (event: WindowEventMap['orca:browser-client-reload-command']): void =>
      onCommand(event.detail)
    window.addEventListener(BROWSER_CLIENT_RELOAD_EVENT, receive)
    return () => {
      epoch.current += 1
      window.removeEventListener(BROWSER_CLIENT_RELOAD_EVENT, receive)
    }
  }, [])
}
