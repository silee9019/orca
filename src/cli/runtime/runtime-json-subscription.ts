import type { PairingOffer } from '../../shared/pairing'
import type { RuntimeStatus } from '../../shared/runtime-types'
import type { RuntimeRpcResponse, RuntimeRpcSuccess } from './types'
import { RuntimeClientError, RuntimeRpcFailureError } from './types'
import {
  RemoteRuntimeClientError,
  subscribeRemoteRuntimeRequest,
  sendRemoteRuntimeRequest
} from '../../shared/remote-runtime-client'
import { readMetadata } from './metadata'
import { subscribeLocalRuntimeJson } from './local-runtime-json-subscription'

export type NativeChatSubscription = { close: () => void }
export type NativeChatSubscriptionCallbacks = {
  onResponse: (response: RuntimeRpcResponse<unknown>) => void
  onError: (error: Error) => void
  onClose: () => void
}
export async function subscribeCliRuntimeJson(
  options: {
    userDataPath: string
    pairing: PairingOffer | null
    timeoutMs: number
    validateStatus: (response: RuntimeRpcSuccess<RuntimeStatus>) => void
  },
  request: {
    method: string
    params: unknown
    localCapability:
      | 'agentWorkerRecoveryStreaming'
      | 'agentStatusMigrationStreaming'
      | 'agentStatusStreaming'
      | 'structuredHeldStreaming'
      | 'nativeChatStreaming'
      | 'terminalPresentationStreaming'
      | 'agentAwakeStreaming'
      | 'remoteWorkspaceStreaming'
  },
  callbacks: NativeChatSubscriptionCallbacks,
  signal: AbortSignal
): Promise<NativeChatSubscription> {
  if (!options.pairing) {
    const metadata = readMetadata(options.userDataPath)
    return subscribeLocalRuntimeJson(
      metadata,
      { ...request, capability: metadata[request.localCapability] },
      options.timeoutMs,
      callbacks,
      signal
    )
  }
  const translate = (error: Error): Error =>
    error instanceof RemoteRuntimeClientError
      ? new RuntimeClientError(error.code, error.message, error.data)
      : error
  try {
    const status = await sendRemoteRuntimeRequest<RuntimeStatus>(
      options.pairing,
      'status.get',
      undefined,
      options.timeoutMs,
      undefined,
      signal
    )
    if (!status.ok) {
      throw new RuntimeRpcFailureError(status)
    }
    options.validateStatus(status)
    signal.throwIfAborted()
    return await subscribeRemoteRuntimeRequest(
      options.pairing,
      request.method,
      request.params,
      options.timeoutMs,
      {
        ...callbacks,
        onResponse: (response) => {
          if (response.ok && response._meta.runtimeId !== status._meta.runtimeId) {
            callbacks.onError(
              new RuntimeClientError(
                'runtime_unavailable',
                'The selected runtime changed while the event subscription opened.'
              )
            )
            return
          }
          callbacks.onResponse(response)
        },
        onError: (error) => callbacks.onError(translate(error))
      },
      { signal }
    )
  } catch (error) {
    throw error instanceof Error ? translate(error) : error
  }
}
