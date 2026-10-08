import { sameWorkspaceFilters } from '../../../shared/workspace-filter-command'
import type { WorkspaceFilters } from '../../../shared/rpc-contract/workspace-filter-params'

export type WorkspaceFilterView = {
  filters: WorkspaceFilters
  runtimeContextKey: string
  visibleWorktreeIds: readonly string[]
  visibleFolderWorkspaceIds: readonly string[]
}

let published: WorkspaceFilterView | null = null
const listeners = new Set<() => void>()

export function publishWorkspaceFilterView(view: WorkspaceFilterView | null): void {
  published = view
  for (const listener of listeners) {
    listener()
  }
}

export function waitForWorkspaceFilterView(
  filters: WorkspaceFilters,
  runtimeContextKey: string,
  timeoutMs: number
): Promise<WorkspaceFilterView | null> {
  return new Promise((resolve) => {
    const finish = (view: WorkspaceFilterView | null): void => {
      clearTimeout(timer)
      listeners.delete(check)
      resolve(view)
    }
    const check = (): void => {
      if (
        published?.runtimeContextKey === runtimeContextKey &&
        sameWorkspaceFilters(published.filters, filters)
      ) {
        finish(published)
      }
    }
    const timer = setTimeout(() => finish(null), timeoutMs)
    listeners.add(check)
    check()
  })
}
