import {
  useCallback,
  useEffect,
  useState,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction
} from 'react'
import { toast } from 'sonner'
import { useMountedRef } from '@/hooks/useMountedRef'
import { translate } from '@/i18n/i18n'
import { unwrapRuntimeRpcResult } from '@/runtime/runtime-rpc-client'
import { extractRuntimeTransportDiagnostics } from '@/runtime/runtime-status-probe-diagnostics'
import { useAppStore } from '@/store'
import {
  isUserManagedRuntimeEnvironment,
  type PublicKnownRuntimeEnvironment
} from '../../../../shared/runtime-environments'
import type { RuntimeStatus } from '../../../../shared/runtime-types'
import { evaluateHostDetails, type RuntimeHostDetails } from './runtime-environment-host-details'

type RuntimeEnvironmentCatalog = {
  environments: PublicKnownRuntimeEnvironment[]
  isLoading: boolean
  detailsByEnvironmentId: Record<string, RuntimeHostDetails>
  setDetailsByEnvironmentId: Dispatch<SetStateAction<Record<string, RuntimeHostDetails>>>
  mountedRef: MutableRefObject<boolean>
  loadEnvironments: (verified?: {
    environmentId: string
    runtimeStatus: RuntimeStatus
  }) => Promise<PublicKnownRuntimeEnvironment[] | null>
}

export function useRuntimeEnvironmentCatalog(): RuntimeEnvironmentCatalog {
  const [environments, setEnvironments] = useState<PublicKnownRuntimeEnvironment[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [detailsByEnvironmentId, setDetailsByEnvironmentId] = useState<
    Record<string, RuntimeHostDetails>
  >({})
  const mountedRef = useMountedRef()
  const loadIdRef = useRef(0)

  const loadEnvironments = useCallback(
    async (verified?: {
      environmentId: string
      runtimeStatus: RuntimeStatus
    }): Promise<PublicKnownRuntimeEnvironment[] | null> => {
      const loadId = ++loadIdRef.current
      if (mountedRef.current && loadIdRef.current === loadId) {
        setIsLoading(true)
      }
      try {
        const nextEnvironments = await window.api.runtimeEnvironments.list()
        if (!mountedRef.current || loadIdRef.current !== loadId) {
          return null
        }
        const visibleEnvironments = nextEnvironments.filter(isUserManagedRuntimeEnvironment)
        // Why: drop store status for servers no longer saved so stale hosts don't
        // linger in the sidebar registry.
        useAppStore.getState().setRuntimeEnvironments(nextEnvironments)
        if (verified) {
          await useAppStore.getState().readRuntimeHostStatusSnapshots()
        }
        if (mountedRef.current && loadIdRef.current === loadId) {
          setEnvironments(visibleEnvironments)
          setDetailsByEnvironmentId((current) => {
            const next: Record<string, RuntimeHostDetails> = {}
            for (const environment of visibleEnvironments) {
              next[environment.id] =
                verified?.environmentId === environment.id
                  ? {
                      status: 'ready',
                      runtimeStatus: verified.runtimeStatus,
                      remoteControl: verified.runtimeStatus.remoteControl ?? null,
                      compatibility: evaluateHostDetails(verified.runtimeStatus),
                      error: null
                    }
                  : (current[environment.id] ?? {
                      status: 'loading',
                      runtimeStatus: null,
                      remoteControl: null,
                      compatibility: null,
                      error: null
                    })
            }
            return next
          })
        }
        await Promise.allSettled(
          visibleEnvironments
            .filter((environment) => environment.id !== verified?.environmentId)
            .map(async (environment) => {
              try {
                const response = await window.api.runtimeEnvironments.getStatus({
                  selector: environment.id,
                  timeoutMs: 10_000
                })
                const runtimeStatus = unwrapRuntimeRpcResult<RuntimeStatus>(response)
                // Why: feed the live status into the store so sidebar host pickers
                // reflect manual refreshes, not just the settings pane.
                await useAppStore.getState().readRuntimeHostStatusSnapshots()
                if (!mountedRef.current || loadIdRef.current !== loadId) {
                  return
                }
                setDetailsByEnvironmentId((current) => ({
                  ...current,
                  [environment.id]: {
                    status: 'ready',
                    runtimeStatus,
                    remoteControl: runtimeStatus.remoteControl ?? null,
                    compatibility: evaluateHostDetails(runtimeStatus),
                    error: null
                  }
                }))
              } catch (error) {
                // Why: record the failed probe (null status) so the sidebar can
                // distinguish unreachable from never-checked.
                const remoteControl = extractRuntimeTransportDiagnostics(error)
                await useAppStore.getState().readRuntimeHostStatusSnapshots()
                if (!mountedRef.current || loadIdRef.current !== loadId) {
                  return
                }
                setDetailsByEnvironmentId((current) => ({
                  ...current,
                  [environment.id]: {
                    status: 'error',
                    runtimeStatus: null,
                    remoteControl: remoteControl ?? null,
                    compatibility: null,
                    error: error instanceof Error ? error.message : String(error)
                  }
                }))
              }
            })
        )
        return mountedRef.current && loadIdRef.current === loadId ? visibleEnvironments : null
      } catch (error) {
        if (mountedRef.current && loadIdRef.current === loadId) {
          toast.error(
            error instanceof Error
              ? error.message
              : translate(
                  'auto.components.settings.RuntimeEnvironmentsPane.e6410d72c3',
                  'Failed to load runtime environments.'
                )
          )
        }
        return null
      } finally {
        if (mountedRef.current && loadIdRef.current === loadId) {
          setIsLoading(false)
        }
      }
    },
    [mountedRef]
  )

  useEffect(() => {
    void loadEnvironments()
  }, [loadEnvironments])

  return {
    environments,
    isLoading,
    detailsByEnvironmentId,
    setDetailsByEnvironmentId,
    mountedRef,
    loadEnvironments
  }
}
