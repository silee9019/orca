import { useCallback, useRef, useState, type RefObject } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { runtimePairingLinkCache } from './runtime-pairing-link-state'

export function useRuntimePairingUrlCopy({
  generatedAddress,
  selectedAddress,
  webClientUrl,
  runtimePairingUrl,
  mountedRef
}: {
  generatedAddress: string | null
  selectedAddress: string
  webClientUrl: string | null
  runtimePairingUrl: string | null
  mountedRef: RefObject<boolean>
}) {
  const [copiedTarget, setCopiedTarget] = useState<'web' | 'pairing' | null>(null)
  const copiedTargetResetTimerRef = useRef<number | null>(null)
  const copyingRef = useRef(false)
  const clearCopiedTargetResetTimer = useCallback((): void => {
    if (copiedTargetResetTimerRef.current === null) {
      return
    }
    window.clearTimeout(copiedTargetResetTimerRef.current)
    copiedTargetResetTimerRef.current = null
  }, [])

  const setContainerNode = useCallback(
    (node: HTMLDivElement | null): void => {
      // Why: copy feedback timers are owned by this settings surface; clear
      // them when Settings collapses or navigates away.
      if (!node) {
        clearCopiedTargetResetTimer()
      }
    },
    [clearCopiedTargetResetTimer]
  )

  const copyGeneratedUrl = async (
    target: 'web' | 'pairing',
    value: string
  ): Promise<(() => boolean) | null> => {
    if (
      copyingRef.current ||
      generatedAddress !== selectedAddress ||
      (target === 'web' ? webClientUrl : runtimePairingUrl) !== value
    ) {
      return null
    }
    copyingRef.current = true
    try {
      await window.api.ui.writeClipboardText(value)
      if (mountedRef.current) {
        clearCopiedTargetResetTimer()
        setCopiedTarget(target)
        copiedTargetResetTimerRef.current = window.setTimeout(() => {
          copiedTargetResetTimerRef.current = null
          if (mountedRef.current) {
            setCopiedTarget((current) => (current === target ? null : current))
          }
        }, 1400)
        toast.success(
          target === 'web'
            ? translate(
                'auto.components.settings.RuntimePairingUrlGenerator.13704d635e',
                'Copied web client URL.'
              )
            : translate(
                'auto.components.settings.RuntimePairingUrlGenerator.df0aa45a86',
                'Copied pairing URL.'
              )
        )
      }
      return mountedRef.current
        ? () =>
            mountedRef.current &&
            runtimePairingLinkCache.generatedAddress === runtimePairingLinkCache.selectedAddress &&
            (target === 'web'
              ? runtimePairingLinkCache.webClientUrl
              : runtimePairingLinkCache.runtimePairingUrl) === value
        : null
    } catch (error) {
      if (mountedRef.current) {
        toast.error(
          error instanceof Error
            ? error.message
            : translate(
                'auto.components.settings.RuntimePairingUrlGenerator.d6c081adf4',
                'Failed to copy URL.'
              )
        )
      }
      return null
    } finally {
      copyingRef.current = false
    }
  }

  return { copiedTarget, setContainerNode, copyGeneratedUrl }
}
