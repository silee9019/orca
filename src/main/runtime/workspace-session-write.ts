import { isDeepStrictEqual } from 'node:util'
import type { WorkspaceSessionState } from '../../shared/workspace-session-state-types'
import type { RuntimeStore } from './runtime-store-contract'
import {
  requireLosslessWorkspaceSession,
  requireLosslessWorkspaceSessionPatch
} from '../../shared/node-workspace-session-validation'
import { rollbackWorkspaceSessionAfterFailedAsyncWrite } from '../persistence/restoring-sessions/workspace-session-write-rollback'

type Receipt =
  | { applied: true; durable: true; normalized: boolean }
  | { applied: false; reason: 'changed' | 'cancelled' }
function commitWorkspaceSessionMutation(
  store: RuntimeStore,
  hostId: string,
  expected: WorkspaceSessionState,
  next: WorkspaceSessionState,
  apply: () => void,
  signal?: AbortSignal
): Promise<Receipt> {
  const { getWorkspaceSession, setWorkspaceSession } = store
  if (!getWorkspaceSession || !setWorkspaceSession || !store.runDurableMutation) {
    throw new Error('workspace_session_write_store_unavailable')
  }
  return store.runDurableMutation<Receipt>(() => {
    if (signal?.aborted) {
      return { persist: false, value: { applied: false, reason: 'cancelled' } }
    }
    const before = structuredClone(getWorkspaceSession.call(store, hostId))
    if (!isDeepStrictEqual(before, expected)) {
      return { persist: false, value: { applied: false, reason: 'changed' } }
    }
    apply()
    const staged = structuredClone(getWorkspaceSession.call(store, hostId))
    return {
      value: { applied: true, durable: true, normalized: !isDeepStrictEqual(staged, next) },
      rollback: () =>
        setWorkspaceSession.call(
          store,
          rollbackWorkspaceSessionAfterFailedAsyncWrite(
            before,
            staged,
            getWorkspaceSession.call(store, hostId)
          ),
          hostId
        )
    }
  })
}
export async function replaceWorkspaceSessionState(
  store: RuntimeStore,
  params: { hostId: string; expected: unknown; next: unknown },
  signal?: AbortSignal
): Promise<Receipt> {
  const expected = requireLosslessWorkspaceSession(params.expected)
  const next = requireLosslessWorkspaceSession(params.next)
  const { setWorkspaceSession } = store
  if (!setWorkspaceSession) {
    throw new Error('workspace_session_write_store_unavailable')
  }
  return commitWorkspaceSessionMutation(
    store,
    params.hostId,
    expected,
    next,
    () => setWorkspaceSession.call(store, next, params.hostId),
    signal
  )
}
export async function patchWorkspaceSessionState(
  store: RuntimeStore,
  params: { hostId: string; expected: unknown; patch: unknown },
  signal?: AbortSignal
): Promise<Receipt> {
  const expected = requireLosslessWorkspaceSession(params.expected)
  const patch = requireLosslessWorkspaceSessionPatch(params.patch, expected)
  const { patchWorkspaceSession } = store
  if (!patchWorkspaceSession) {
    throw new Error('workspace_session_patch_store_unavailable')
  }
  return commitWorkspaceSessionMutation(
    store,
    params.hostId,
    expected,
    { ...expected, ...patch },
    () => patchWorkspaceSession.call(store, patch, params.hostId),
    signal
  )
}
