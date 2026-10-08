import type { RuntimeNotifier } from './runtime-notifier-contract'

export type LegacyWorkerRecoveryEvent = {
  paneKey: string
  resolution: 'adopted' | 'exited' | 'rolled_back'
  ptyId?: string
}
type Observer = { changed: (event: LegacyWorkerRecoveryEvent) => void; failed: () => void }
const observers = new WeakMap<object, Set<Observer>>()
export function subscribeLegacyWorkerRecovery(
  owner: object,
  changed: Observer['changed'],
  failed: Observer['failed']
): () => void {
  const entries = observers.get(owner) ?? new Set<Observer>()
  observers.set(owner, entries)
  const observer = { changed, failed }
  entries.add(observer)
  return () => {
    entries.delete(observer)
  }
}
export function getLegacyWorkerRecoveryObserverCount(owner: object): number {
  return observers.get(owner)?.size ?? 0
}
export function publishLegacyWorkerRecovery(
  owner: object,
  notifier: Pick<RuntimeNotifier, 'resolveLegacyWorkerTerminalRecovery'> | null | undefined,
  event: LegacyWorkerRecoveryEvent
): void {
  for (const observer of observers.get(owner) ?? []) {
    try {
      observer.changed(event)
    } catch {
      observers.get(owner)?.delete(observer)
      try {
        observer.failed()
      } catch {
        continue
      }
    }
  }
  if (event.ptyId) {
    notifier?.resolveLegacyWorkerTerminalRecovery?.(event.paneKey, event.resolution, event.ptyId)
  } else {
    notifier?.resolveLegacyWorkerTerminalRecovery?.(event.paneKey, event.resolution)
  }
}
