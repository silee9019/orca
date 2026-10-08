import { useLayoutEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { readWorkspaceFilters } from '../../../shared/workspace-filter-command'
import { publishWorkspaceFilterView } from './workspace-filter-view'

export function useWorkspaceFilterPublication(
  visibleWorktreeIds: readonly string[],
  visibleFolderWorkspaceIds: readonly string[]
): void {
  const filters = useAppStore(
    useShallow((state) => ({ ...readWorkspaceFilters(state), filterRepoIds: state.filterRepoIds }))
  )
  const runtimeContextKey = useAppStore((state) => getProviderRuntimeContextKey(state.settings))
  useLayoutEffect(() => {
    publishWorkspaceFilterView({
      filters: readWorkspaceFilters(filters),
      runtimeContextKey,
      visibleWorktreeIds,
      visibleFolderWorkspaceIds
    })
    return () => publishWorkspaceFilterView(null)
  }, [filters, runtimeContextKey, visibleWorktreeIds, visibleFolderWorkspaceIds])
}
