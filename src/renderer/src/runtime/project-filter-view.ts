export type ProjectFilterView = {
  repoIds: readonly string[]
  visibleWorktreeIds: readonly string[]
  visibleFolderWorkspaceIds: readonly string[]
}
let published: ProjectFilterView | null = null
const listeners = new Set<() => void>()

export function publishProjectFilterView(view: ProjectFilterView | null): void {
  published = view
  for (const listener of listeners) {
    listener()
  }
}

export function waitForProjectFilterView(
  repoIds: readonly string[],
  timeoutMs: number
): Promise<ProjectFilterView | null> {
  return new Promise((resolve) => {
    const finish = (view: ProjectFilterView | null): void => {
      clearTimeout(timer)
      listeners.delete(check)
      resolve(view)
    }
    const check = (): void => {
      if (
        published &&
        published.repoIds.length === repoIds.length &&
        published.repoIds.every((id, index) => id === repoIds[index])
      ) {
        finish(published)
      }
    }
    const timer = setTimeout(() => finish(null), timeoutMs)
    listeners.add(check)
    check()
  })
}
