import { useCallback, useRef, type MutableRefObject } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type { ComputerUsePermissionState } from '../../../../shared/computer-use-permissions-types'

type ComputerPermissionRefreshOptions = {
  mountedRef: MutableRefObject<boolean>
  resettingRef: MutableRefObject<boolean>
  permissionOperationSequence: MutableRefObject<number>
  setLoading: (loading: boolean) => void
  setPlatform: (platform: NodeJS.Platform) => void
  setStates: (states: ComputerUsePermissionState[]) => void
  setHelperUnavailableReason: (reason: string | null) => void
  read: () => {
    platform: NodeJS.Platform | null
    states: ComputerUsePermissionState[]
    helperUnavailableReason: string | null
  }
}
export function useComputerPermissionRefresh(
  options: ComputerPermissionRefreshOptions
): (canApply?: () => boolean) => Promise<(() => boolean) | undefined> {
  const current = useRef(options)
  current.current = options
  return useCallback(async (canApply?: () => boolean) => {
    const {
      mountedRef,
      resettingRef,
      permissionOperationSequence,
      setLoading,
      setPlatform,
      setStates,
      setHelperUnavailableReason
    } = current.current
    if (resettingRef.current) {
      return undefined
    }
    const operationId = ++permissionOperationSequence.current
    setLoading(true)
    try {
      const result = await window.api.computerUsePermissions.getStatus()
      if (
        operationId !== permissionOperationSequence.current ||
        !mountedRef.current ||
        (canApply && !canApply())
      ) {
        return undefined
      }
      setPlatform(result.platform)
      setStates(result.permissions)
      setHelperUnavailableReason(result.helperUnavailableReason)
      return () => {
        const state = current.current.read()
        return (
          operationId === permissionOperationSequence.current &&
          mountedRef.current &&
          state.platform === result.platform &&
          state.states === result.permissions &&
          state.helperUnavailableReason === result.helperUnavailableReason
        )
      }
    } catch (error) {
      if (
        operationId !== permissionOperationSequence.current ||
        !mountedRef.current ||
        (canApply && !canApply())
      ) {
        return undefined
      }
      toast.error(
        error instanceof Error
          ? error.message
          : translate(
              'auto.components.settings.ComputerUsePane.2168fa5ab0',
              'Could not load Computer Use permissions'
            )
      )
    } finally {
      if (operationId === permissionOperationSequence.current && mountedRef.current) {
        setLoading(false)
      }
    }
    return undefined
  }, [])
}
