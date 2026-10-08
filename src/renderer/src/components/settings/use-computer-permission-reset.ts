import { useCallback, useRef, type MutableRefObject } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type { ComputerUsePermissionState } from '../../../../shared/computer-use-permissions-types'

type ComputerPermissionResetOptions = {
  mountedRef: MutableRefObject<boolean>
  resettingRef: MutableRefObject<boolean>
  permissionOperationSequence: MutableRefObject<number>
  setResetting: (resetting: boolean) => void
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
export function useComputerPermissionReset(
  options: ComputerPermissionResetOptions
): (canApply?: () => boolean) => Promise<(() => boolean) | undefined> {
  const current = useRef(options)
  current.current = options
  return useCallback(async (canApply?: () => boolean) => {
    const {
      mountedRef,
      resettingRef,
      permissionOperationSequence,
      setResetting,
      setLoading,
      setPlatform,
      setStates,
      setHelperUnavailableReason
    } = current.current
    if (resettingRef.current) {
      return undefined
    }
    resettingRef.current = true
    const operationId = ++permissionOperationSequence.current
    setResetting(true)
    try {
      const result = await window.api.computerUsePermissions.reset()
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
      toast.message(
        translate(
          'auto.components.settings.ComputerUsePane.f189f448a3',
          'Reset Computer Use access'
        )
      )
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
              'auto.components.settings.ComputerUsePane.3383ea1aab',
              'Could not reset Computer Use permissions'
            )
      )
    } finally {
      if (operationId === permissionOperationSequence.current && mountedRef.current) {
        resettingRef.current = false
        setResetting(false)
        setLoading(false)
      }
    }
    return undefined
  }, [])
}
