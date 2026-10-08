import type { MigrationUnsupportedPtyEntry } from '../../shared/agent-status-types'

export type MigrationUnsupportedPtyEvent =
  | { type: 'set'; entry: MigrationUnsupportedPtyEntry }
  | { type: 'clear'; ptyId: string }

const observers = new Set<{
  changed: (event: MigrationUnsupportedPtyEvent) => void
  failed: () => void
}>()
export function subscribeMigrationUnsupportedPtyChanges(
  changed: (event: MigrationUnsupportedPtyEvent) => void,
  failed: () => void
): () => void {
  const observer = { changed, failed }
  observers.add(observer)
  return () => {
    observers.delete(observer)
  }
}
export function getMigrationUnsupportedPtyObserverCount(): number {
  return observers.size
}
export function publishMigrationUnsupportedPtyChange(event: MigrationUnsupportedPtyEvent): void {
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
