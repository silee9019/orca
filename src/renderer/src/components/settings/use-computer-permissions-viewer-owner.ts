import { useEffect, useRef, useState } from 'react'
import type { ComputerUsePermissionState } from '../../../../shared/computer-use-permissions-types'
import {
  ComputerPermissionsViewerCommand,
  ComputerPermissionsViewerState
} from '../../../../shared/rpc-contract/computer-permissions-viewer-params'
import {
  COMPUTER_PERMISSIONS_VIEWER_EVENT,
  type ComputerPermissionsViewerEvent
} from '@/runtime/computer-permissions-viewer-request'
import { requireComputerPermissionsViewer } from '@/runtime/computer-permissions-viewer-actions'

type ComputerPermissionsOwner = {
  platform: NodeJS.Platform | null
  states: ComputerUsePermissionState[]
  loading: boolean
  helperUnavailableReason: string | null
  isResetting: () => boolean
  refresh: (canApply?: () => boolean) => Promise<(() => boolean) | undefined>
}
export function useComputerPermissionsViewerOwner(owner: ComputerPermissionsOwner): void {
  const current = useRef(owner)
  current.current = owner
  const pending = useRef<ComputerPermissionsViewerEvent | null>(null)
  const ready = useRef(true)
  const receipt = useRef<(() => boolean) | undefined>(undefined)
  const [, publishCompletion] = useState(0)
  const finishCommitted = (): void => {
    const request = pending.current
    if (!request || !ready.current) {
      return
    }
    pending.current = null
    if (request.isSettled()) {
      return
    }
    try {
      requireComputerPermissionsViewer()
      if (Date.now() >= request.expiresAt) {
        throw new Error('computer_permissions_readback_expired_effect_unknown')
      }
      if (
        request.command.action === 'refresh' &&
        (!receipt.current?.() || current.current.loading)
      ) {
        throw new Error('computer_permissions_refresh_failed_effect_unknown')
      }
      const state = ComputerPermissionsViewerState.parse({
        platform: current.current.platform,
        permissions: current.current.states,
        loading: current.current.loading,
        helperUnavailable: current.current.helperUnavailableReason !== null
      })
      request.finish(undefined, state)
    } catch {
      request.finish(new Error('computer_permissions_refresh_failed_effect_unknown'))
    }
  }
  useEffect(finishCommitted)
  useEffect(() => {
    const receive = (event: WindowEventMap[typeof COMPUTER_PERMISSIONS_VIEWER_EVENT]): void => {
      const request = event.detail
      if (!ComputerPermissionsViewerCommand.safeParse(request.command).success) {
        return
      }
      request.offer(() => {
        try {
          requireComputerPermissionsViewer()
          if (request.isSettled() || Date.now() >= request.expiresAt) {
            throw new Error('computer_permissions_request_expired')
          }
          if (pending.current && !pending.current.isSettled()) {
            throw new Error('computer_permissions_request_busy')
          }
          if (request.command.action === 'refresh' && current.current.isResetting()) {
            throw new Error('computer_permissions_reset_busy')
          }
          if (
            request.command.action === 'refresh' &&
            current.current.platform !== null &&
            current.current.platform !== 'darwin'
          ) {
            throw new Error('computer_permissions_refresh_unavailable')
          }
          pending.current = request
          ready.current = true
          receipt.current = undefined
          if (request.command.action === 'status') {
            finishCommitted()
            return
          }
          ready.current = false
          void current.current
            .refresh(() => {
              try {
                requireComputerPermissionsViewer()
                return !request.isSettled() && Date.now() < request.expiresAt
              } catch {
                return false
              }
            })
            .then((result) => {
              if (pending.current !== request || request.isSettled()) {
                return
              }
              if (!result) {
                pending.current = null
                request.finish(new Error('computer_permissions_refresh_failed_effect_unknown'))
                return
              }
              receipt.current = result
              ready.current = true
              publishCompletion((value) => value + 1)
            })
            .catch(() =>
              request.finish(new Error('computer_permissions_refresh_failed_effect_unknown'))
            )
        } catch (error) {
          request.finish(
            error instanceof Error ? error : new Error('computer_permissions_action_failed')
          )
        }
      })
    }
    window.addEventListener(COMPUTER_PERMISSIONS_VIEWER_EVENT, receive)
    return () => {
      pending.current?.finish(new Error('computer_permissions_owner_changed_effect_unknown'))
      pending.current = null
      window.removeEventListener(COMPUTER_PERMISSIONS_VIEWER_EVENT, receive)
    }
  }, [])
}
