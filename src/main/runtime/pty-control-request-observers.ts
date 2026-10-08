import type { TerminalControlRequestSignal } from '../../shared/rpc-contract/terminal-control-watch-params'

type Observer = { changed: (request: TerminalControlRequestSignal) => void; failed: () => void }
const observers = new WeakMap<object, Set<Observer>>()
export function subscribePtyControlRequests(
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
export function getPtyControlRequestObserverCount(owner: object): number {
  return observers.get(owner)?.size ?? 0
}
export function publishPtyControlRequest(
  owner: object | undefined,
  request: TerminalControlRequestSignal
): void {
  if (!owner) {
    return
  }
  for (const observer of observers.get(owner) ?? []) {
    try {
      observer.changed(
        request.kind === 'serialize-buffer'
          ? { ...request, ...(request.opts ? { opts: { ...request.opts } } : {}) }
          : { ...request }
      )
    } catch {
      observers.get(owner)?.delete(observer)
      try {
        observer.failed()
      } catch {
        continue
      }
    }
  }
}
