import { useEffect, useLayoutEffect, useRef } from 'react'
import {
  REMOTE_BROWSER_PANE_COMMAND_EVENT,
  type RemoteBrowserPaneEvent
} from '@/runtime/browser-remote-pane-request'
import type {
  BrowserRemotePaneState,
  BrowserRemotePaneCommand,
  BrowserRemotePaneInputCommand,
  BrowserRemotePaneNavigationCommand
} from '../../../../../shared/rpc-contract/browser-remote-pane-params'
import type { RemoteBrowserStreamStatus } from './remote-browser-stream-status'

type RemotePaneOwner = {
  page: string
  environmentId: string
  remotePageId: string | null
  active: boolean
  staged: boolean
  streamStatus: RemoteBrowserStreamStatus
  reconnectGeneration: number
  performNavigation?: (
    command: BrowserRemotePaneNavigationCommand,
    isCurrent: () => boolean
  ) => Promise<void>
  performInput?: (command: BrowserRemotePaneInputCommand, isCurrent: () => boolean) => Promise<void>
  performMarkup?: (
    command: Extract<BrowserRemotePaneCommand, { action: 'markup' | 'markup-editor' }>,
    isCurrent: () => boolean,
    expiresAt: number
  ) => Promise<Pick<BrowserRemotePaneState, 'markup' | 'markupEditor'>>
  reconnect: () => void
}
function snapshot(owner: RemotePaneOwner, reconnectRequested: boolean): BrowserRemotePaneState {
  return {
    environmentId: owner.environmentId,
    remotePageId: owner.remotePageId,
    streamStatus: owner.streamStatus.kind,
    streamConnected: owner.streamStatus.kind === 'live',
    reconnectRequested,
    reconnectGeneration: owner.reconnectGeneration
  }
}
export function useRemoteBrowserPaneCommands(owner: RemotePaneOwner): void {
  const current = useRef(owner)
  const inputPending = useRef<RemoteBrowserPaneEvent | null>(null)
  const pending = useRef<{ request: RemoteBrowserPaneEvent; generation: number } | null>(null)
  useLayoutEffect(() => {
    current.current = owner
  })
  useEffect(() => {
    const operation = pending.current
    if (!operation) {
      return
    }
    const value = current.current
    if (operation.request.isSettled()) {
      pending.current = null
      return
    }
    if (Date.now() >= operation.request.expiresAt) {
      operation.request.finish(new Error('request_expired_effect_unknown'))
      pending.current = null
      return
    }
    if (
      !value.active ||
      value.staged ||
      value.environmentId !== operation.request.command.environmentId
    ) {
      operation.request.finish(new Error('remote_browser_pane_owner_changed_effect_unknown'))
      pending.current = null
      return
    }
    if (value.reconnectGeneration > operation.generation) {
      operation.request.finish(undefined, snapshot(value, true))
      pending.current = null
    }
  })
  useEffect(() => {
    const receive = (event: WindowEventMap['orca:remote-browser-pane-command']): void => {
      const request = event.detail
      const value = current.current
      if (request.page !== value.page || !request.claim()) {
        return
      }
      if (Date.now() >= request.expiresAt) {
        request.finish(new Error('request_expired'))
        return
      }
      if (
        value.environmentId !== request.command.environmentId ||
        value.remotePageId !== request.command.expectedRemotePageId
      ) {
        request.finish(new Error('remote_browser_pane_target_mismatch'))
        return
      }
      if (!value.active || value.staged) {
        request.finish(new Error('remote_browser_pane_inactive_or_staged'))
        return
      }
      if (request.command.action === 'status') {
        request.finish(undefined, snapshot(value, false))
        return
      }
      const cancellingMarkup =
        request.command.action === 'markup' &&
        request.command.markupAction === 'cancel' &&
        (inputPending.current?.command.action === 'markup' ||
          inputPending.current?.command.action === 'markup-editor')
      if (
        (pending.current && !pending.current.request.isSettled()) ||
        (inputPending.current && !cancellingMarkup)
      ) {
        request.finish(new Error('remote_browser_pane_busy'))
        return
      }
      if (
        request.command.action === 'click' ||
        request.command.action === 'key' ||
        request.command.action === 'navigate' ||
        request.command.action === 'markup' ||
        request.command.action === 'markup-editor'
      ) {
        if (
          request.command.action === 'markup' || request.command.action === 'markup-editor'
            ? !value.performMarkup
            : request.command.action === 'navigate'
              ? !value.performNavigation
              : !value.performInput || value.streamStatus.kind !== 'live'
        ) {
          request.finish(new Error('remote_browser_input_unavailable'))
          return
        }
        inputPending.current = request
        const isCurrent = (): boolean => {
          const owner = current.current
          return (
            !request.isSettled() &&
            Date.now() < request.expiresAt &&
            owner.active &&
            !owner.staged &&
            owner.page === request.page &&
            owner.environmentId === request.command.environmentId &&
            owner.remotePageId === request.command.expectedRemotePageId
          )
        }
        const operation =
          request.command.action === 'markup' || request.command.action === 'markup-editor'
            ? value.performMarkup?.(request.command, isCurrent, request.expiresAt)
            : request.command.action === 'navigate'
              ? value.performNavigation?.(request.command, isCurrent)
              : value.performInput?.(request.command, isCurrent)
        if (!operation) {
          request.finish(new Error('remote_browser_input_unavailable'))
          inputPending.current = null
          return
        }
        void operation
          .then(
            (result) => {
              if (!isCurrent()) {
                request.finish(new Error('remote_browser_input_cancelled_effect_unknown'))
              } else {
                request.finish(undefined, {
                  ...snapshot(current.current, false),
                  ...result,
                  ...(request.command.action === 'navigate'
                    ? { navigationApplied: true }
                    : request.command.action === 'click' || request.command.action === 'key'
                      ? { inputAccepted: true }
                      : {})
                })
              }
            },
            (error: unknown) =>
              request.finish(
                error instanceof Error
                  ? error
                  : new Error('remote_browser_input_failed_effect_unknown')
              )
          )
          .finally(() => {
            if (inputPending.current === request) {
              inputPending.current = null
            }
          })
        return
      }
      if (request.command.action !== 'reconnect') {
        request.finish(new Error('remote_browser_pane_action_unavailable'))
        return
      }
      if (value.streamStatus.kind !== 'stopped') {
        request.finish(new Error('remote_browser_reconnect_unavailable'))
        return
      }
      pending.current = { request, generation: value.reconnectGeneration }
      try {
        value.reconnect()
      } catch {
        pending.current = null
        request.finish(new Error('remote_browser_reconnect_failed_effect_unknown'))
      }
    }
    window.addEventListener(REMOTE_BROWSER_PANE_COMMAND_EVENT, receive)
    return () => window.removeEventListener(REMOTE_BROWSER_PANE_COMMAND_EVENT, receive)
  }, [owner.page])
  useEffect(
    () => () => {
      inputPending.current?.finish(new Error('remote_browser_pane_unmounted_effect_unknown'))
      inputPending.current = null
      pending.current?.request.finish(new Error('remote_browser_pane_unmounted_effect_unknown'))
      pending.current = null
    },
    [owner.page]
  )
}
