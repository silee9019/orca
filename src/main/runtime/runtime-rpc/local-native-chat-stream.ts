import type { OrcaRuntimeService } from '../orca-runtime'
import type { RpcRequest, RpcResponse } from '../rpc/core'
import type { RpcDispatcher } from '../rpc/dispatcher'
import type { RpcMessageContext } from '../rpc/transport'
import { errorResponse } from '../rpc/errors'

export async function dispatchLocalNativeChatStream(
  request: RpcRequest,
  context: RpcMessageContext | undefined,
  runtime: OrcaRuntimeService,
  dispatcher: RpcDispatcher
): Promise<RpcResponse | undefined> {
  const meta = { runtimeId: runtime.getRuntimeId() }
  if (
    (request.method !== 'nativeChat.subscribe' &&
      request.method !== 'terminal.presentation.subscribe') ||
    !context?.stream
  ) {
    return errorResponse(
      request.id,
      meta,
      'method_not_supported',
      'Local streaming is unsupported for this method'
    )
  }
  if (!context.stream.begin()) {
    return errorResponse(
      request.id,
      meta,
      'runtime_busy',
      'This local connection already owns a stream'
    )
  }
  const { connectionId, send } = context.stream
  const cleanup = (): void => runtime.cleanupSubscriptionsForConnection(connectionId)
  context.signal.addEventListener('abort', cleanup, { once: true })
  context.startKeepalive()
  if (context.signal.aborted) {
    cleanup()
    return undefined
  }
  await dispatcher.dispatchStreaming(request, send, { connectionId, signal: context.signal })
  return undefined
}
