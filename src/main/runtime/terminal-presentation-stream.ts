import type { OrcaRuntimeService } from './orca-runtime'
import type { RpcContext } from './rpc/core'
import type { TerminalPresentationSubscriptionParams } from '../../shared/rpc-contract/terminal-presentation-watch-params'

const active = new WeakMap<OrcaRuntimeService, Set<string>>()
export function getActiveTerminalPresentationStreamCount(runtime: OrcaRuntimeService): number {
  return active.get(runtime)?.size ?? 0
}
export function subscribeTerminalPresentationStream(
  params: TerminalPresentationSubscriptionParams,
  context: RpcContext,
  emit: (event: unknown) => void,
  assertOwner: () => void
): void {
  const { runtime, connectionId, signal } = context
  if (!connectionId) {
    throw new Error('terminal_presentation_connection_required')
  }
  const key = `terminalPresentation:${connectionId}:${params.subscriptionId}`
  const streams = active.get(runtime) ?? new Set<string>()
  if (streams.size >= 64 && !streams.has(key)) {
    throw new Error('terminal_presentation_stream_capacity')
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
  const event = (value: unknown) => {
    if (closed) {
      return
    }
    try {
      assertOwner()
    } catch {
      emit({ type: 'error', code: 'terminal_presentation_owner_changed' })
      aborted()
      return
    }
    emit({ type: 'event', kind: params.kind, sequence: ++sequence, value })
  }
  runtime.registerSubscriptionCleanup(key, cleanup, connectionId)
  streams.add(key)
  signal?.addEventListener('abort', aborted, { once: true })
  try {
    assertOwner()
    signal?.throwIfAborted()
    register(
      params.kind === 'driver'
        ? runtime.subscribeToDriverChanges(params.expectedPtyId, event)
        : runtime.subscribeToFitOverrideChanges(params.expectedPtyId, event)
    )
    register(runtime.subscribeToPtyExit(params.expectedPtyId, aborted))
    if (!closed) {
      emit({ type: 'ready', kind: params.kind, sequence: 0 })
    }
  } catch (error) {
    aborted()
    throw error
  }
}
