import type { OrcaRuntimeService } from './orca-runtime'
import type { RpcContext } from './rpc/core'

const active = new WeakMap<OrcaRuntimeService, Set<string>>()
export function getActiveRuntimeJsonEventStreamCount(
  runtime: OrcaRuntimeService,
  namespace: 'terminalPresentation' | 'agentAwake' | 'remoteWorkspace' | 'structuredHeld'
): number {
  return [...(active.get(runtime) ?? [])].filter((key) => key.startsWith(`${namespace}:`)).length
}
export function createRuntimeJsonEventSubscription(
  context: RpcContext,
  namespace: 'terminalPresentation' | 'agentAwake' | 'remoteWorkspace' | 'structuredHeld',
  subscriptionId: string,
  emit: (event: unknown) => void,
  assertOwner: () => void
) {
  const { runtime, connectionId, signal } = context
  if (!connectionId) {
    throw new Error('runtime_event_connection_required')
  }
  const key = `${namespace}:${connectionId}:${subscriptionId}`
  const streams = active.get(runtime) ?? new Set<string>()
  if (streams.size >= 64 && !streams.has(key)) {
    throw new Error('runtime_event_stream_capacity')
  }
  active.set(runtime, streams)
  let closed = false,
    sequence = 0
  const disposals: (() => void)[] = []
  const cleanup = () => {
    if (closed) {
      return
    }
    closed = true
    streams.delete(key)
    signal?.removeEventListener('abort', aborted)
    for (const dispose of disposals.splice(0)) {
      dispose()
    }
    emit({ type: 'end', sequence })
  }
  function aborted() {
    runtime.cleanupSubscription(key)
  }
  const register = (dispose: () => void) => {
    if (closed) {
      dispose()
    } else {
      disposals.push(dispose)
    }
  }
  const event = (value: Record<string, unknown>) => {
    if (closed) {
      return
    }
    try {
      assertOwner()
    } catch {
      emit({
        type: 'error',
        code:
          namespace === 'terminalPresentation'
            ? 'terminal_presentation_owner_changed'
            : namespace === 'agentAwake'
              ? 'agent_awake_unavailable'
              : namespace === 'structuredHeld'
                ? 'structured_held_unavailable'
                : 'remote_workspace_unavailable'
      })
      aborted()
      return
    }
    emit({ ...value, type: 'event', sequence: ++sequence })
  }
  runtime.registerSubscriptionCleanup(key, cleanup, connectionId)
  streams.add(key)
  signal?.addEventListener('abort', aborted, { once: true })
  try {
    assertOwner()
    signal?.throwIfAborted()
  } catch (error) {
    aborted()
    throw error
  }
  return {
    event,
    register,
    close: aborted,
    ready: (value: Record<string, unknown> = {}) => {
      if (!closed) {
        emit({ ...value, type: 'ready', sequence: 0 })
      }
    }
  }
}
