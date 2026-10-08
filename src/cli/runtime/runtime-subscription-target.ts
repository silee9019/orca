import type { NativeChatSubscriptionCallbacks } from './native-chat-subscription'
import type { NativeChatSubscriptionParams } from '../../shared/rpc-contract/native-chat-watch'
import type { TerminalPresentationSubscriptionParams } from '../../shared/rpc-contract/terminal-presentation-watch-params'
import type { AgentAwakeSubscriptionParams } from '../../shared/rpc-contract/agent-awake-watch-params'
export type StreamArgs<Params> = [
  params: Params,
  callbacks: NativeChatSubscriptionCallbacks,
  signal: AbortSignal
]
export type SubscriptionParams =
  | NativeChatSubscriptionParams
  | TerminalPresentationSubscriptionParams
  | AgentAwakeSubscriptionParams
import type { RemoteRuntimeCompatGate } from './remote-runtime-compat-gate'
import { markEnvironmentUsed } from './environments'
import type { PairingOffer } from '../../shared/pairing'
import type { RuntimeStatus } from '../../shared/runtime-types'
import type { RuntimeRpcSuccess } from './types'

export function createCliRuntimeSubscriptionOptions(
  userDataPath: string,
  pairing: PairingOffer | null,
  timeoutMs: number,
  remoteCompat: RemoteRuntimeCompatGate,
  environmentSelector: string | null
) {
  return {
    userDataPath,
    pairing,
    timeoutMs,
    validateStatus: (response: RuntimeRpcSuccess<RuntimeStatus>) => {
      remoteCompat.noteVerifiedStatus(response.result)
      if (environmentSelector) {
        markEnvironmentUsed(userDataPath, environmentSelector, {
          runtimeId: response._meta.runtimeId
        })
      }
    }
  }
}

export function resolveRuntimeEventCapability(
  method: 'nativeChat.subscribe' | 'terminal.presentation.subscribe' | 'agentAwake.subscribe'
) {
  return method === 'nativeChat.subscribe'
    ? 'nativeChatStreaming'
    : method === 'agentAwake.subscribe'
      ? 'agentAwakeStreaming'
      : 'terminalPresentationStreaming'
}
