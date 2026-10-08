import type { RemoteWorkspaceChangedEvent } from '../../shared/remote-workspace-types'

const observers = new Set<{
  changed: (event: RemoteWorkspaceChangedEvent) => void
  failed: () => void
}>()
export function subscribeRemoteWorkspaceChanges(
  changed: (event: RemoteWorkspaceChangedEvent) => void,
  failed: () => void
): () => void {
  const observer = { changed, failed }
  observers.add(observer)
  return () => {
    observers.delete(observer)
  }
}
export function getRemoteWorkspaceChangeObserverCount(): number {
  return observers.size
}
export function publishRemoteWorkspaceChange(event: RemoteWorkspaceChangedEvent): void {
  for (const observer of observers) {
    try {
      observer.changed(event)
    } catch {
      observers.delete(observer)
      try {
        observer.failed()
      } catch {
        continue
      }
    }
  }
}
