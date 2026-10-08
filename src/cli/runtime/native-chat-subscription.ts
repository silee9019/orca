import type { PairingOffer } from '../../shared/pairing'
import type { NativeChatSubscriptionParams } from '../../shared/rpc-contract/native-chat-watch'
import type { RuntimeStatus } from '../../shared/runtime-types'
import type { RuntimeRpcResponse, RuntimeRpcSuccess } from './types'
import { RuntimeClientError, RuntimeRpcFailureError } from './types'
import {
  RemoteRuntimeClientError,
  subscribeRemoteRuntimeRequest,
  sendRemoteRuntimeRequest
} from '../../shared/remote-runtime-client'
import { readMetadata } from './metadata'
import { subscribeLocalNativeChat } from './local-native-chat-subscription'

export type NativeChatSubscription = { close: () => void }
export type NativeChatSubscriptionCallbacks = {
  onResponse: (response: RuntimeRpcResponse<unknown>) => void
  onError: (error: Error) => void
  onClose: () => void
}
export async function subscribeCliNativeChat(
  options: {
    userDataPath: string
    pairing: PairingOffer | null
    timeoutMs: number
    validateStatus: (response: RuntimeRpcSuccess<RuntimeStatus>) => void
  },
  params: NativeChatSubscriptionParams,
  callbacks: NativeChatSubscriptionCallbacks,
  signal: AbortSignal
): Promise<NativeChatSubscription> {
  if (!options.pairing) {
    return subscribeLocalNativeChat(
      readMetadata(options.userDataPath),
      params,
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
      'nativeChat.subscribe',
      params,
      options.timeoutMs,
      {
        ...callbacks,
        onResponse: (response) => {
          if (response.ok && response._meta.runtimeId !== status._meta.runtimeId) {
            callbacks.onError(
              new RuntimeClientError(
                'runtime_unavailable',
                'The selected runtime changed while the transcript subscription opened.'
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
