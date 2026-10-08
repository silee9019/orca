import type { Store } from '../persistence'
import { setRemoteWorkspaceForConnectedTargets } from '../ipc/remote-workspace'
import type { RemoteWorkspacePublishRequest } from '../../shared/rpc-contract/remote-workspace-publish-params'
import { requireLosslessWorkspaceSession } from '../../shared/node-workspace-session-validation'

export async function publishConnectedRemoteWorkspaceTargets(
  store: Store,
  params: RemoteWorkspacePublishRequest
) {
  const session =
    params.session === undefined ? undefined : requireLosslessWorkspaceSession(params.session)
  try {
    const entries = await setRemoteWorkspaceForConnectedTargets(store, {
      session,
      hydratedTargetIds: params.targets.map((target) => target.targetId),
      expectedRevisionsByTargetId: Object.fromEntries(
        params.targets.map((target) => [target.targetId, target.expectedRevision])
      ),
      expectedHostObservationTokensByTargetId: Object.fromEntries(
        params.targets.map((target) => [target.targetId, target.hostObservationToken])
      )
    })
    const byTarget = new Map(entries.map(({ targetId, result }) => [targetId, result] as const))
    const targets = params.targets.map(({ targetId }) => {
      const result = byTarget.get(targetId)
      return result?.ok
        ? { targetId, accepted: true, revision: result.snapshot.revision }
        : { targetId, accepted: false, reason: result?.reason ?? 'unavailable' }
    })
    const allTargetsAccepted = targets.every((target) => target.accepted)
    return { allTargetsAccepted, partialPublishPossible: !allTargetsAccepted, targets }
  } catch {
    return {
      allTargetsAccepted: false,
      partialPublishPossible: true,
      targets: params.targets.map(({ targetId }) => ({
        targetId,
        accepted: false,
        reason: 'unavailable'
      }))
    }
  }
}
