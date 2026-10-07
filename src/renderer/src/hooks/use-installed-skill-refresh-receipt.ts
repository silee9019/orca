import { useCallback, useLayoutEffect, useRef, type MutableRefObject } from 'react'
import type { SkillDiscoveryResult } from '../../../shared/skills'
import type { RuntimeClientTarget } from '@/runtime/runtime-client-target'

type InstalledSkillReceiptState = {
  result: SkillDiscoveryResult | null
  runtimeTarget: RuntimeClientTarget | null
  targetKey: MutableRefObject<string>
  generation: MutableRefObject<number>
  mounted: MutableRefObject<boolean>
}
export function useInstalledSkillRefreshReceipt(state: InstalledSkillReceiptState) {
  const current = useRef(state)
  current.current = state
  const committedResult = useRef(state.result)
  useLayoutEffect(() => {
    committedResult.current = state.result
  }, [state.result])
  return useCallback(
    (
      result: SkillDiscoveryResult,
      generation: number,
      targetKey: string,
      runtimeTarget: RuntimeClientTarget
    ) =>
      (): boolean =>
        current.current.mounted.current &&
        current.current.generation.current === generation &&
        current.current.targetKey.current === targetKey &&
        current.current.runtimeTarget === runtimeTarget &&
        committedResult.current === result,
    []
  )
}

export type ScanReceiptReady = (receipt: () => boolean) => void
export function useSkillRefreshWithReceipt(
  refresh: (
    force?: boolean,
    showLoading?: boolean,
    onSuccess?: ScanReceiptReady
  ) => Promise<boolean>
): () => Promise<(() => boolean) | undefined> {
  return useCallback(async () => {
    let receipt: (() => boolean) | undefined
    await refresh(true, true, (value) => {
      receipt = value
    })
    return receipt
  }, [refresh])
}
