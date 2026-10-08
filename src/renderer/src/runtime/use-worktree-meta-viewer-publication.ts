import { useAppStore } from '@/store'
import {
  getWorktreeExecutionHostId,
  getSettingsFocusedExecutionHostId
} from '../../../shared/execution-host'
import type { Worktree } from '../../../shared/worktree/types'

export function useWorktreeMetaViewerPublication(
  worktree: Worktree | undefined,
  focus: string,
  seedReady: boolean
) {
  const hostId = useAppStore((state) =>
    worktree
      ? getWorktreeExecutionHostId(
          worktree,
          state.repos.find((repo) => repo.id === worktree.repoId),
          getSettingsFocusedExecutionHostId(state.settings)
        )
      : ''
  )
  return {
    'data-worktree-meta-workspace': worktree?.id ?? '',
    'data-worktree-meta-repo': worktree?.repoId ?? '',
    'data-worktree-meta-host': hostId,
    'data-worktree-meta-focus': focus,
    'data-worktree-meta-seed-ready': seedReady ? 'true' : 'false'
  }
}
