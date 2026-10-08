import type { CliStatusResult, RuntimeStatus } from '../../shared/runtime-types'
import { runtimeHostConnectionState } from '../../shared/runtime-host-connection-state'
import type { RuntimeRpcSuccess } from './types'
import { projectRemoteAppStatus } from './status'

export function projectRemoteCliStatus(
  response: RuntimeRpcSuccess<RuntimeStatus>,
  environmentSelector: string | null
): RuntimeRpcSuccess<CliStatusResult> {
  const graphState = response.result.graphStatus
  return {
    id: response.id,
    ok: true,
    result: {
      target: {
        kind: 'environment',
        environment: environmentSelector ?? 'pairing-code'
      },
      app: projectRemoteAppStatus(response.result),
      runtime: {
        state: graphState === 'ready' ? 'ready' : 'graph_not_ready',
        reachable: true,
        connectionState: runtimeHostConnectionState({
          hasStatusEntry: true,
          status: response.result
        }),
        runtimeId: response.result.runtimeId,
        ...(response.result.appVersion ? { appVersion: response.result.appVersion } : {}),
        ...(response.result.remoteUpdateSupport
          ? { remoteUpdateSupport: response.result.remoteUpdateSupport }
          : {}),
        ...(response.result.capabilities ? { capabilities: response.result.capabilities } : {}),
        ...(response.result.degradations ? { degradations: response.result.degradations } : {})
      },
      graph: {
        state: graphState
      }
    },
    _meta: response._meta
  }
}
