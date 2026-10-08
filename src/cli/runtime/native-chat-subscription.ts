import type { NativeChatSubscriptionParams } from '../../shared/rpc-contract/native-chat-watch'
import {
  subscribeCliRuntimeJson,
  type NativeChatSubscriptionCallbacks
} from './runtime-json-subscription'
export type {
  NativeChatSubscription,
  NativeChatSubscriptionCallbacks
} from './runtime-json-subscription'

export function subscribeCliNativeChat(
  options: Parameters<typeof subscribeCliRuntimeJson>[0],
  params: NativeChatSubscriptionParams,
  callbacks: NativeChatSubscriptionCallbacks,
  signal: AbortSignal
) {
  return subscribeCliRuntimeJson(
    options,
    { method: 'nativeChat.subscribe', params, localCapability: 'nativeChatStreaming' },
    callbacks,
    signal
  )
}
