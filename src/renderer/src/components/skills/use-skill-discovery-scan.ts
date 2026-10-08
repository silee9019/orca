import { useCallback, useEffect, useRef, useState } from 'react'
import { readIpcErrorDetail } from '@/lib/ipc-error'
import { discoverSkillsForRuntimeTarget } from '@/runtime/runtime-skills-client'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { useMountedRef } from '@/hooks/useMountedRef'
import type { SkillDiscoveryResult } from '../../../../shared/skills'
import { retainedShareableSkillSelection } from './skill-share-selection'
import { retainedDeletableSkillSelection } from './skill-delete-selection'

type SkillScanState = {
  runtimeTarget: RuntimeClientTarget
  result: SkillDiscoveryResult | null
  error: { detail?: string } | null
}

export function useSkillDiscoveryScan(
  runtimeTarget: RuntimeClientTarget | null,
  selectionMode: 'share' | 'delete' | null,
  setSelectedSkillIds: React.Dispatch<React.SetStateAction<Set<string>>>
) {
  const [scanState, setScanState] = useState<SkillScanState | null>(null)
  // Target identity changes on host switches and same-ID re-pairs.
  const currentScan = scanState?.runtimeTarget === runtimeTarget ? scanState : null
  const result = currentScan?.result ?? null
  const [loading, setLoading] = useState(true)
  const scanError = currentScan?.error ?? null
  const mountedRef = useMountedRef()
  const scanGenerationRef = useRef(0)
  // Why a ref: `loadSkills` must not re-identify (and re-scan) when the user
  // merely switches selection mode. Switching modes clears the selection anyway,
  // so a one-render lag here cannot retain the wrong rows.
  const selectionModeRef = useRef(selectionMode)
  useEffect(() => {
    selectionModeRef.current = selectionMode
  }, [selectionMode])

  const loadSkills = useCallback(
    async (refresh = false): Promise<void> => {
      setLoading(true)
      // Why: a cold local scan walks every skill root, so switching runtimes can
      // land a stale result after a newer one. Only the newest scan may write.
      const scanGeneration = ++scanGenerationRef.current
      const isCurrentScan = (): boolean =>
        mountedRef.current && scanGeneration === scanGenerationRef.current
      if (!runtimeTarget) {
        // Why: keep scanning until the owning runtime is known, rather than
        // showing the client's skills to someone whose skills live remotely.
        return
      }
      try {
        const nextResult = await discoverSkillsForRuntimeTarget(
          runtimeTarget,
          refresh ? { refresh: true } : undefined
        )
        const local = runtimeTarget.kind === 'local'
        if (isCurrentScan()) {
          setScanState({ runtimeTarget, result: nextResult, error: null })
          setSelectedSkillIds((current) =>
            selectionModeRef.current === 'delete'
              ? retainedDeletableSkillSelection(current, nextResult.skills)
              : retainedShareableSkillSelection(current, nextResult.skills, local)
          )
        }
      } catch (error) {
        console.error('Failed to discover skills:', error)
        if (isCurrentScan()) {
          // Why: a failed scan needs to stay on screen with a retry — a toast
          // disappears before the user can act on it.
          setScanState((current) => ({
            runtimeTarget,
            result: current?.runtimeTarget === runtimeTarget ? current.result : null,
            error: { detail: readIpcErrorDetail(error) }
          }))
        }
      } finally {
        if (isCurrentScan()) {
          setLoading(false)
        }
      }
    },
    [mountedRef, runtimeTarget]
  )

  useEffect(() => {
    void loadSkills()
  }, [loadSkills])

  return { result, loading, scanError, loadSkills }
}
