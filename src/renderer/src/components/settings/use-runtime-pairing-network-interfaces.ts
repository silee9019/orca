import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'

export function useRuntimePairingNetworkInterfaces(mountedRef: RefObject<boolean>) {
  const [networkInterfaces, setNetworkInterfaces] = useState<{ name: string; address: string }[]>(
    []
  )
  const [refreshingNetworkInterfaces, setRefreshingNetworkInterfaces] = useState(false)
  const networkInterfaceLoadIdRef = useRef(0)
  const loadNetworkInterfaces = useCallback(
    async (
      options: { showToastOnError?: boolean } = {}
    ): Promise<{ name: string; address: string }[] | null> => {
      const loadId = networkInterfaceLoadIdRef.current + 1
      networkInterfaceLoadIdRef.current = loadId
      if (mountedRef.current) {
        setRefreshingNetworkInterfaces(true)
      }
      try {
        const result = await window.api.mobile.listNetworkInterfaces()
        if (mountedRef.current && loadId === networkInterfaceLoadIdRef.current) {
          setNetworkInterfaces(result.interfaces)
          return result.interfaces
        }
        return null
      } catch {
        if (
          mountedRef.current &&
          loadId === networkInterfaceLoadIdRef.current &&
          options.showToastOnError
        ) {
          toast.error(
            translate(
              'auto.components.settings.RuntimePairingUrlGenerator.95b8be4cea',
              'Failed to refresh network interfaces.'
            )
          )
        }
        return null
      } finally {
        if (mountedRef.current && loadId === networkInterfaceLoadIdRef.current) {
          setRefreshingNetworkInterfaces(false)
        }
      }
    },
    [mountedRef]
  )

  useEffect(() => {
    void loadNetworkInterfaces()
    return () => {
      networkInterfaceLoadIdRef.current += 1
    }
  }, [loadNetworkInterfaces])

  return {
    networkInterfaces,
    refreshingNetworkInterfaces,
    loadNetworkInterfaces
  }
}
