import { useEffectEvent, useLayoutEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { BROWSER_ADDRESS_COMMAND_EVENT } from '@/runtime/browser-address-request'
import type { RemoteBrowserPageHandle } from '@/store/slices/browser/browser-slice-contract'
import { browserPageDocLocationsEqual } from '../../../../../shared/browser-page-doc-location'
import type { BrowserClientDocumentSource } from '@/runtime/browser-client-document-source'
import { isBrowserClientDocumentSourceCurrent } from '@/runtime/browser-client-document-source'
import {
  BROWSER_CLIENT_HISTORY_DOCUMENT_EVENT,
  type BrowserClientHistoryDocumentEvent
} from '@/runtime/browser-client-history-document-request'
import type { BrowserAddressController } from './use-browser-address-commands'

export type BrowserHistoryDocumentOwner = {
  source: BrowserClientDocumentSource
  active: boolean
}
export function useClientHistoryDocumentCommands(
  owner: BrowserHistoryDocumentOwner | undefined,
  controller: Pick<BrowserAddressController, 'open' | 'suggestions' | 'select' | 'inputRef'>
): void {
  const epoch = useRef(0)
  const mounted = useRef(false)
  const performing = useRef(false)
  const effectHandle = useRef<RemoteBrowserPageHandle | undefined>(undefined)
  const invalidated = useRef(false)
  const destination = useRef<string | null>(null)
  const destinationReached = useRef(false)
  const pendingDispose = useRef<(() => void) | null>(null)
  const current = useRef({ owner, controller })
  useLayoutEffect(() => {
    if (
      current.current.owner?.active !== owner?.active ||
      current.current.owner?.source.kind !== owner?.source.kind ||
      Object.entries(current.current.owner?.source.target ?? {}).some(
        ([key, value]) => Reflect.get(owner?.source.target ?? {}, key) !== value
      ) ||
      current.current.controller.suggestions !== controller.suggestions ||
      current.current.controller.open !== controller.open
    ) {
      epoch.current += 1
    }
    current.current = { owner, controller }
  })
  const receive = useEffectEvent((request: BrowserClientHistoryDocumentEvent) => {
    const source = owner?.source
    if (
      !owner?.active ||
      !source ||
      source.kind !== request.command.source.kind ||
      Object.entries(request.command.source.target).some(
        ([key, value]) => Reflect.get(source.target, key) !== value
      ) ||
      !isBrowserClientDocumentSourceCurrent(source)
    ) {
      return
    }
    const offeredEpoch = epoch.current
    request.offer(() => {
      const latest = current.current
      if (
        request.isSettled() ||
        Date.now() >= request.expiresAt ||
        !mounted.current ||
        !latest.owner?.active ||
        !latest.controller.open ||
        offeredEpoch !== epoch.current ||
        latest.owner.source.kind !== source.kind ||
        Object.entries(source.target).some(
          ([key, value]) => Reflect.get(latest.owner?.source.target ?? {}, key) !== value
        ) ||
        !isBrowserClientDocumentSourceCurrent(source)
      ) {
        request.finish(new Error('browser_client_history_document_owner_changed'))
        return
      }
      const { item } = request.command
      const docLocation = {
        kind: 'workspace-doc' as const,
        worktreeId: item.worktreeId,
        filePath: item.filePath
      }
      const suggestion = latest.controller.suggestions[item.index]
      if (
        !suggestion ||
        !browserPageDocLocationsEqual(suggestion.docLocation ?? null, docLocation) ||
        suggestion.url !== item.filePath ||
        latest.controller.suggestions.some(
          (row) =>
            row.url === suggestion.url &&
            !browserPageDocLocationsEqual(row.docLocation ?? null, docLocation)
        )
      ) {
        request.finish(new Error('browser_client_history_document_item_changed_or_ambiguous'))
        return
      }
      effectHandle.current =
        useAppStore.getState().remoteBrowserPageHandlesByPageId[source.target.page]
      performing.current = true
      invalidated.current = false
      destination.current = item.worktreeId
      destinationReached.current = false
      try {
        latest.controller.select(suggestion.url)
        const state = useAppStore.getState()
        const workspaceId = state.activeBrowserTabIdByWorktree[item.worktreeId]
        const workspace = state.browserTabsByWorktree[item.worktreeId]?.find(
          (row) => row.id === workspaceId
        )
        const page =
          workspace &&
          state.browserPagesByWorkspace[workspace.id]?.find(
            (row) => row.id === workspace.activePageId
          )
        if (
          invalidated.current ||
          Date.now() >= request.expiresAt ||
          state.activeWorktreeId !== item.worktreeId ||
          !workspace ||
          !page ||
          !browserPageDocLocationsEqual(page.docLocation ?? null, docLocation)
        ) {
          request.finish(new Error('browser_client_history_document_effect_unknown'))
          return
        }
        request.finish(undefined, {
          source,
          item,
          selected: true,
          documentWorkspaceId: workspace.id,
          documentPageId: page.id
        })
      } catch {
        request.finish(new Error('browser_client_history_document_effect_unknown'))
      } finally {
        performing.current = false
        pendingDispose.current?.()
        pendingDispose.current = null
        destination.current = null
      }
    })
  })
  const hasHistoryOwner = owner !== undefined
  useLayoutEffect(() => {
    if (!hasHistoryOwner) {
      return
    }
    mounted.current = true
    let history = useAppStore.getState().workspaceDocHistory
    const initialOwner = current.current.owner
    let handle =
      initialOwner &&
      useAppStore.getState().remoteBrowserPageHandlesByPageId[initialOwner.source.target.page]
    const unsubscribe = useAppStore.subscribe((state) => {
      const source = current.current.owner?.source
      if (!source) {
        return
      }
      if (performing.current) {
        if (state.activeWorktreeId === destination.current) {
          destinationReached.current = true
        }
        if (
          (state.activeWorktreeId !== source.target.worktreeId &&
            state.activeWorktreeId !== destination.current) ||
          (destinationReached.current &&
            destination.current !== source.target.worktreeId &&
            state.activeWorktreeId === source.target.worktreeId) ||
          state.activeModal !== 'none' ||
          state.settings?.activeRuntimeEnvironmentId !== source.target.environmentId ||
          (state.remoteBrowserPageHandlesByPageId[source.target.page] &&
            state.remoteBrowserPageHandlesByPageId[source.target.page] !== effectHandle.current) ||
          (!state.remoteBrowserPageHandlesByPageId[source.target.page] &&
            Object.values(state.browserPagesByWorkspace)
              .flat()
              .some((page) => page.id === source.target.page))
        ) {
          invalidated.current = true
        }
      } else if (
        !isBrowserClientDocumentSourceCurrent(source) ||
        state.workspaceDocHistory !== history ||
        state.remoteBrowserPageHandlesByPageId[source.target.page] !== handle
      ) {
        epoch.current += 1
      }
      history = state.workspaceDocHistory
      handle = state.remoteBrowserPageHandlesByPageId[source.target.page]
    })
    const listener = (event: WindowEventMap['orca:browser-client-history-document']): void =>
      receive(event.detail)
    const changed = (event: Event): void => {
      if (event.target === current.current.controller.inputRef.current) {
        epoch.current += 1
      }
    }
    window.addEventListener('input', changed, true)
    window.addEventListener('change', changed, true)
    window.addEventListener('focusin', changed, true)
    window.addEventListener('focusout', changed, true)
    const addressChanged = (event: WindowEventMap['orca:browser-address-command']): void => {
      if (
        event.detail.page === current.current.owner?.source.target.page &&
        event.detail.command.action !== 'status'
      ) {
        epoch.current += 1
      }
    }
    window.addEventListener(BROWSER_ADDRESS_COMMAND_EVENT, addressChanged, true)
    window.addEventListener(BROWSER_CLIENT_HISTORY_DOCUMENT_EVENT, listener)
    return () => {
      mounted.current = false
      epoch.current += 1
      if (performing.current) {
        pendingDispose.current = unsubscribe
      } else {
        unsubscribe()
      }
      window.removeEventListener(BROWSER_ADDRESS_COMMAND_EVENT, addressChanged, true)
      window.removeEventListener(BROWSER_CLIENT_HISTORY_DOCUMENT_EVENT, listener)
      window.removeEventListener('input', changed, true)
      window.removeEventListener('change', changed, true)
      window.removeEventListener('focusin', changed, true)
      window.removeEventListener('focusout', changed, true)
    }
  }, [hasHistoryOwner])
}
