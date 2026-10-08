import type { RuntimeMobileSessionTabMove } from '../../../../shared/runtime-types'
import { getRuntimeEnvironmentIdForWorktree } from '@/lib/worktree-runtime-owner'
import { useAppStore } from '../../store'
import {
  isWebRuntimeSessionActive,
  moveWebRuntimeSessionTab
} from '../../runtime/web-runtime-session'

export function mirrorWebRuntimeTabMove(
  args: RuntimeMobileSessionTabMove & {
    worktreeId: string
  },
  observeCompletion?: (completion: Promise<boolean>) => void
): void {
  const environmentId = getRuntimeEnvironmentIdForWorktree(useAppStore.getState(), args.worktreeId)
  if (!isWebRuntimeSessionActive(environmentId)) {
    return
  }
  const completion = moveWebRuntimeSessionTab({
    ...args,
    environmentId,
    requireAcknowledgedMove: observeCompletion !== undefined
  })
  observeCompletion?.(completion)
}
