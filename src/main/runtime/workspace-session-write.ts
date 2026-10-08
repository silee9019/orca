import { isDeepStrictEqual } from 'node:util'
import type { RuntimeStore } from './runtime-store-contract'
import { requireLosslessWorkspaceSession } from '../../shared/node-workspace-session-validation'
import { rollbackWorkspaceSessionAfterFailedAsyncWrite } from '../persistence/restoring-sessions/workspace-session-write-rollback'

type Receipt =
  | { applied: true; durable: true; normalized: boolean }
  | { applied: false; reason: 'changed' | 'cancelled' }
export async function replaceWorkspaceSessionState(
  store: RuntimeStore,
  params: { hostId: string; expected: unknown; next: unknown },
  signal?: AbortSignal
): Promise<Receipt> {
  const expected = requireLosslessWorkspaceSession(params.expected)
  const next = requireLosslessWorkspaceSession(params.next)
  const { getWorkspaceSession, setWorkspaceSession } = store
  if (!getWorkspaceSession || !setWorkspaceSession || !store.runDurableMutation) {
    throw new Error('workspace_session_write_store_unavailable')
  }
  return store.runDurableMutation<Receipt>(() => {
    if (signal?.aborted) {
      return { persist: false, value: { applied: false, reason: 'cancelled' } }
    }
    const before = structuredClone(getWorkspaceSession.call(store, params.hostId))
    if (!isDeepStrictEqual(before, expected)) {
      return { persist: false, value: { applied: false, reason: 'changed' } }
    }
    setWorkspaceSession.call(store, next, params.hostId)
    const staged = structuredClone(getWorkspaceSession.call(store, params.hostId))
    return {
      value: { applied: true, durable: true, normalized: !isDeepStrictEqual(staged, next) },
      rollback: () =>
        setWorkspaceSession.call(
          store,
          rollbackWorkspaceSessionAfterFailedAsyncWrite(
            before,
            staged,
            getWorkspaceSession.call(store, params.hostId)
          ),
          params.hostId
        )
    }
  })
}
