export type SettingsViewerView = {
  runtimeContextKey: string
  activeSectionId: string
  queryInput: string
  queryApplied: string
  visibleSectionIds: string[]
  renderedSectionIds: string[]
  renderedTargetIds: string[]
  navigationPending: boolean
  hasUnsavedChanges: boolean
}

let published: SettingsViewerView | null = null
const listeners = new Set<() => void>()
export function publishSettingsViewerView(view: SettingsViewerView | null): void {
  published = view
  for (const listener of listeners) {
    listener()
  }
}
export function readSettingsViewerView(): SettingsViewerView | null {
  return published
}
export function waitForSettingsViewerView(
  matches: (view: SettingsViewerView) => boolean,
  timeoutMs: number
): Promise<SettingsViewerView | null> {
  return new Promise((resolve) => {
    const finish = (view: SettingsViewerView | null): void => {
      clearTimeout(timer)
      listeners.delete(check)
      resolve(view)
    }
    const check = (): void => {
      if (published && matches(published)) {
        finish(published)
      }
    }
    const timer = setTimeout(() => finish(null), timeoutMs)
    listeners.add(check)
    check()
  })
}
