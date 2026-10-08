import type { RuntimeMetadata } from '../../shared/runtime-bootstrap'
import type { NativeChatSubscriptionParams } from '../../shared/rpc-contract/native-chat-watch'
import type { NativeChatSubscriptionCallbacks } from './native-chat-subscription'
import { subscribeLocalRuntimeJson } from './local-runtime-json-subscription'

export function subscribeLocalNativeChat(
  metadata: RuntimeMetadata,
  params: NativeChatSubscriptionParams,
  timeoutMs: number,
  callbacks: NativeChatSubscriptionCallbacks,
  signal: AbortSignal
) {
  return subscribeLocalRuntimeJson(
    metadata,
    { method: 'nativeChat.subscribe', params, capability: metadata.nativeChatStreaming },
    timeoutMs,
    callbacks,
    signal
  )
}
