import type { ExecutionHostId } from '../../../../shared/execution-host'

export function getToggledAllHostIds(
  visibleHostIds: readonly ExecutionHostId[] | null,
  hostIds: readonly ExecutionHostId[]
): ExecutionHostId[] | null | undefined {
  if (visibleHostIds !== null) {
    return null
  }
  const firstHost = hostIds[0]
  return firstHost ? [firstHost] : undefined
}

export function getToggledHostIds(
  visibleHostIds: readonly ExecutionHostId[] | null,
  hostIds: readonly ExecutionHostId[],
  hostId: ExecutionHostId
): ExecutionHostId[] | null | undefined {
  if (visibleHostIds === null) {
    return [hostId]
  }
  const next = new Set(visibleHostIds)
  if (next.has(hostId)) {
    if (next.size <= 1) {
      return undefined
    }
    next.delete(hostId)
  } else {
    next.add(hostId)
  }
  return next.size === hostIds.length ? null : [...next]
}
