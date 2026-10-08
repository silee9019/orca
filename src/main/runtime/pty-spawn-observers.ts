import { getPtyExecutionHost } from '../../shared/terminal-execution-host'
import { parseExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host'
import type { z } from 'zod'
import type { TerminalSpawnAnnouncement } from '../../shared/rpc-contract/terminal-spawn-watch-params'

type Observer = {
  changed: (event: z.output<typeof TerminalSpawnAnnouncement>) => void
  failed: () => void
}
const observers = new WeakMap<object, Set<Observer>>()
export function subscribePtySpawned(
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
export function getPtySpawnObserverCount(owner: object): number {
  return observers.get(owner)?.size ?? 0
}
export function publishPtySpawned(
  owner: object,
  ptyId: string,
  incarnationId: string | null | undefined,
  awaitsRegistration: boolean
): void {
  const executionHostId = getPtyExecutionHost(ptyId) ?? LOCAL_EXECUTION_HOST_ID
  const host = parseExecutionHostId(executionHostId)
  if (!host || host.kind === 'runtime') {
    return
  }
  const event = {
    ptyId,
    ...(incarnationId ? { incarnationId } : {}),
    executionHostId: host.id,
    awaitsRegistration
  }
  for (const observer of observers.get(owner) ?? []) {
    try {
      observer.changed({ ...event })
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
