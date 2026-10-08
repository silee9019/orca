import {
  isBrowserClientDocumentSourceCurrent,
  matchesBrowserClientDocumentSourceHandle
} from '@/runtime/browser-client-document-source'
import type { RemoteBrowserPageHandle } from '@/store/slices/browser/browser-slice-contract'
import { useEffectEvent, useLayoutEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { browserPageDocLocationsEqual } from '../../../../../shared/browser-page-doc-location'
import {
  BROWSER_CLIENT_DOCUMENT_EVENT,
  type BrowserClientDocumentEvent
} from '@/runtime/browser-client-document-request'
import { resolveWorkspaceDocAddressTarget } from '@/lib/workspace-doc-address-input'
import type { useClientHostedNavigationCommands } from './use-client-hosted-navigation-commands'
export function useClientHostedDocumentCommands(
  params: Parameters<typeof useClientHostedNavigationCommands>[0]
): void {
  const latestOwner = useRef(params)
  latestOwner.current = params
  const offeredSource = useRef<BrowserClientDocumentEvent['source'] | null>(null)
  const offeredHandle = useRef<RemoteBrowserPageHandle | undefined>(undefined)
  const epoch = useRef(0)
  const effectStarted = useRef(false)
  const invalidated = useRef(false)
  const destination = useRef<string | null>(null)
  const destinationReached = useRef(false)
  const pendingCleanup = useRef<(() => void) | null>(null)
  const onCommand = useEffectEvent((request: BrowserClientDocumentEvent) => {
    const { source } = request
    const { target } = source
    if (
      !params.isActive ||
      target.page !== params.page ||
      target.worktreeId !== params.worktreeId ||
      target.environmentId !== params.environmentId ||
      !isBrowserClientDocumentSourceCurrent(source, params.placement)
    ) {
      return
    }
    offeredSource.current = source
    offeredHandle.current = useAppStore.getState().remoteBrowserPageHandlesByPageId[target.page]
    const offeredEpoch = epoch.current
    request.offer(() => {
      const owner = latestOwner.current
      if (
        !owner.isActive ||
        owner.unavailable ||
        offeredEpoch !== epoch.current ||
        target.page !== owner.page ||
        target.worktreeId !== owner.worktreeId ||
        target.environmentId !== owner.environmentId ||
        !isBrowserClientDocumentSourceCurrent(source, owner.placement) ||
        Date.now() >= request.expiresAt
      ) {
        request.finish(new Error('browser_client_document_owner_changed'))
        return
      }
      const resolved = resolveWorkspaceDocAddressTarget(
        useAppStore.getState(),
        target.worktreeId,
        request.value
      )
      if (
        resolved.status !== 'workspace-doc' ||
        resolved.docLocation.worktreeId !== request.documentWorktreeId
      ) {
        request.finish(new Error('browser_client_document_input_unsupported'))
        return
      }
      let observed = false
      effectStarted.current = true
      invalidated.current = false
      destination.current = request.documentWorktreeId
      destinationReached.current = false
      try {
        owner.navigate(request.value, undefined, (outcome) => {
          observed = true
          const state = useAppStore.getState()
          const workspace = (state.browserTabsByWorktree[request.documentWorktreeId] ?? []).find(
            (tab) => tab.id === state.activeBrowserTabIdByWorktree[request.documentWorktreeId]
          )
          const page =
            workspace &&
            (state.browserPagesByWorkspace[workspace.id] ?? []).find(
              (candidate) => candidate.id === workspace.activePageId
            )
          if (
            invalidated.current ||
            Date.now() >= request.expiresAt ||
            outcome.status !== 'workspace-doc' ||
            !browserPageDocLocationsEqual(outcome.docLocation, resolved.docLocation) ||
            outcome.conversion === 'failed' ||
            !workspace ||
            !page ||
            !browserPageDocLocationsEqual(page.docLocation ?? null, resolved.docLocation) ||
            state.activeWorktreeId !== request.documentWorktreeId
          ) {
            request.finish(new Error('browser_client_document_effect_unknown'))
            return
          }
          request.finish(undefined, {
            ...target,
            accepted: true,
            conversion: outcome.conversion,
            documentWorktreeId: request.documentWorktreeId,
            documentPageId: page.id,
            documentWorkspaceId: workspace.id,
            filePath: resolved.docLocation.filePath
          })
        })
        if (!observed) {
          request.finish(new Error('browser_client_document_not_observed'))
        }
      } catch (error) {
        request.finish(
          error instanceof Error ? error : new Error('browser_client_document_effect_unknown')
        )
      } finally {
        effectStarted.current = false
        pendingCleanup.current?.()
        pendingCleanup.current = null
        destination.current = null
      }
    })
  })
  useLayoutEffect(() => {
    const unsubscribe = useAppStore.subscribe((state) => {
      const source = offeredSource.current
      if (!source) {
        return
      }
      const { target } = source
      if (effectStarted.current) {
        const handle = state.remoteBrowserPageHandlesByPageId[target.page]
        if (
          destination.current !== target.worktreeId &&
          state.activeWorktreeId === destination.current
        ) {
          destinationReached.current = true
        }
        if (
          (state.activeWorktreeId !== target.worktreeId &&
            state.activeWorktreeId !== destination.current) ||
          (destinationReached.current && state.activeWorktreeId === target.worktreeId) ||
          state.settings?.activeRuntimeEnvironmentId !== target.environmentId ||
          state.activeModal !== 'none' ||
          (!handle &&
            Object.values(state.browserPagesByWorkspace)
              .flat()
              .some((page) => page.id === target.page)) ||
          (handle &&
            !matchesBrowserClientDocumentSourceHandle(
              source,
              handle,
              params.placement,
              offeredHandle.current
            ))
        ) {
          invalidated.current = true
        }
      } else if (
        !isBrowserClientDocumentSourceCurrent(source, params.placement) ||
        (source.kind === 'staged' &&
          state.remoteBrowserPageHandlesByPageId[target.page] !== offeredHandle.current)
      ) {
        epoch.current += 1
      }
    })
    const listener = (event: WindowEventMap['orca:browser-client-document-command']): void =>
      onCommand(event.detail)
    window.addEventListener(BROWSER_CLIENT_DOCUMENT_EVENT, listener)
    return () => {
      const state = useAppStore.getState()
      const source = offeredSource.current
      const intendedDeactivation =
        !latestOwner.current.isActive &&
        !latestOwner.current.unavailable &&
        source !== null &&
        matchesBrowserClientDocumentSourceHandle(
          source,
          state.remoteBrowserPageHandlesByPageId[params.page],
          latestOwner.current.placement,
          offeredHandle.current
        ) &&
        latestOwner.current.page === params.page &&
        latestOwner.current.worktreeId === params.worktreeId &&
        latestOwner.current.environmentId === params.environmentId &&
        state.activeWorktreeId === destination.current
      if (
        effectStarted.current &&
        !intendedDeactivation &&
        Object.values(useAppStore.getState().browserPagesByWorkspace)
          .flat()
          .some((page) => page.id === params.page)
      ) {
        invalidated.current = true
      }
      epoch.current += 1
      const clearOffer = (): void => {
        offeredSource.current = null
        offeredHandle.current = undefined
      }
      if (effectStarted.current) {
        pendingCleanup.current = () => {
          unsubscribe()
          clearOffer()
        }
      } else {
        unsubscribe()
        clearOffer()
      }
      window.removeEventListener(BROWSER_CLIENT_DOCUMENT_EVENT, listener)
    }
  }, [params.page, params.worktreeId, params.environmentId, params.placement, params.isActive])
}
