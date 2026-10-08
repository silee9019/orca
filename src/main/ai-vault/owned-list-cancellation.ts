import type { RpcContext } from '../runtime/rpc/core'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'

type ScanOwner = Pick<RpcContext, 'runtime' | 'authenticatedCallerFingerprint' | 'signal'>
type OwnedList = { owner: string; controller: AbortController }
const activeLists = new WeakMap<OrcaRuntimeService, Map<string, OwnedList>>()
const MAX_ACTIVE_LISTS = 64

function callerOwner(context: ScanOwner): string {
  return context.authenticatedCallerFingerprint ?? 'local-profile'
}

export async function runOwnedAiVaultListScan<T>(
  context: ScanOwner,
  requestToken: string | undefined,
  scan: (signal?: AbortSignal) => Promise<T>
): Promise<T> {
  if (!requestToken) {
    return scan(context.signal)
  }
  context.signal?.throwIfAborted()
  let lists = activeLists.get(context.runtime)
  if (!lists) {
    lists = new Map()
    activeLists.set(context.runtime, lists)
  }
  if (lists.has(requestToken) || lists.size >= MAX_ACTIVE_LISTS) {
    throw new Error('ai_vault_owned_list_unavailable')
  }
  const registration = { owner: callerOwner(context), controller: new AbortController() }
  lists.set(requestToken, registration)
  const signal = context.signal
    ? AbortSignal.any([context.signal, registration.controller.signal])
    : registration.controller.signal
  try {
    return await scan(signal)
  } finally {
    if (lists.get(requestToken) === registration) {
      lists.delete(requestToken)
      if (lists.size === 0) {
        activeLists.delete(context.runtime)
      }
    }
  }
}

export function cancelOwnedAiVaultListScan(context: ScanOwner, requestToken: string): boolean {
  const active = activeLists.get(context.runtime)?.get(requestToken)
  if (!active || active.owner !== callerOwner(context) || active.controller.signal.aborted) {
    return false
  }
  active.controller.abort()
  return true
}
