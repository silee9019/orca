import type { RuntimeMetadata } from '../../../shared/runtime-bootstrap'
import { writeRuntimeMetadata } from '../runtime-metadata'
import type { RpcMessageContext } from '../rpc/transport'
import type { RpcRequest, RpcResponse } from '../rpc/core'
import { errorResponse } from '../rpc/errors'
import { RuntimeRpcBinaryRouting } from './runtime-rpc-binary-routing'
import { classifyRuntimeLongPoll, type RuntimeLongPollClass } from './runtime-rpc-long-poll'
import { dispatchLocalNativeChatStream } from './local-native-chat-stream'

export class RuntimeRpcRequestAdmission extends RuntimeRpcBinaryRouting {
  // Local requests authenticate with the shared token from the 0o600 metadata file.
  protected async handleMessage(
    rawMessage: string,
    context?: RpcMessageContext
  ): Promise<RpcResponse | undefined> {
    // Why: the transport sends an empty message when a client exceeds max size, then closes the connection.
    if (!rawMessage) {
      return this.buildError('unknown', 'request_too_large', 'RPC request exceeds the maximum size')
    }

    const parsed = this.parseAndAuth(rawMessage)
    if ('error' in parsed) {
      return parsed.error
    }
    const request = parsed.request
    if (request.localStream === 1) {
      return dispatchLocalNativeChatStream(request, context, this.runtime, this.dispatcher)
    }

    // Why: long-poll admission fence; short RPCs bypass the counter. See §7 risk #2.
    const longPoll = classifyRuntimeLongPoll(request)
    const rejection = this.admitLongPoll(longPoll)
    if (rejection) {
      return this.buildError(request.id, 'runtime_busy', rejection)
    }
    if (longPoll) {
      // Why: arm keepalive only for long-polls; short RPCs never create the setInterval. See §3.1.
      context?.startKeepalive()
    }

    try {
      if (
        (request.method === 'accounts.observeCodexLogin' ||
          request.method === 'rateLimits.subscribe' ||
          request.method === 'macosTccPrompts.observeThreshold') &&
        context?.streamReply
      ) {
        await this.dispatcher.dispatchStreaming(request, context.streamReply, {
          signal: context.signal
        })
        return {
          id: request.id,
          ok: true,
          result: { type: 'end' },
          _meta: { runtimeId: this.runtime.getRuntimeId() }
        }
      }
      return await this.dispatcher.dispatch(request, {
        signal: longPoll ? context?.signal : undefined
      })
    } finally {
      this.releaseLongPoll(longPoll)
    }
  }

  // Why: one fence for both transports — the total cap protects short RPCs, the ask
  // sub-cap protects terminal.wait / check --wait from slow reply-blocked asks.
  // Returns the rejection message, or null once the slot is reserved.
  protected admitLongPoll(
    longPoll: RuntimeLongPollClass | null,
    pairedDeviceId?: string
  ): string | null {
    if (!longPoll) {
      return null
    }
    if (this.activeLongPolls >= this.longPollCap) {
      return 'long-poll capacity reached; retry with backoff'
    }
    if (
      (longPoll === 'ask' || longPoll === 'browser-host') &&
      this.activeAskLongPolls + this.activeBrowserHostLongPolls >= this.specializedLongPollCap
    ) {
      return longPoll === 'ask'
        ? 'orchestration.ask capacity reached; retry with backoff'
        : 'browser-host capacity reached; retry with backoff'
    }
    if (longPoll === 'ask' && this.activeAskLongPolls >= this.askLongPollCap) {
      return 'orchestration.ask capacity reached; retry with backoff'
    }
    if (
      longPoll === 'browser-host' &&
      (this.activeBrowserHostLongPolls >= this.browserHostLongPollCap ||
        (pairedDeviceId !== undefined &&
          (this.activeBrowserHostLongPollsByDevice.get(pairedDeviceId) ?? 0) >=
            this.browserHostLongPollCapPerDevice))
    ) {
      return 'browser-host capacity reached; retry with backoff'
    }
    this.activeLongPolls += 1
    if (longPoll === 'ask') {
      this.activeAskLongPolls += 1
    } else if (longPoll === 'browser-host') {
      this.activeBrowserHostLongPolls += 1
      if (pairedDeviceId !== undefined) {
        this.activeBrowserHostLongPollsByDevice.set(
          pairedDeviceId,
          (this.activeBrowserHostLongPollsByDevice.get(pairedDeviceId) ?? 0) + 1
        )
      }
    }
    return null
  }

  protected releaseLongPoll(longPoll: RuntimeLongPollClass | null, pairedDeviceId?: string): void {
    if (!longPoll) {
      return
    }
    this.activeLongPolls = Math.max(0, this.activeLongPolls - 1)
    if (longPoll === 'ask') {
      this.activeAskLongPolls = Math.max(0, this.activeAskLongPolls - 1)
    } else if (longPoll === 'browser-host') {
      this.activeBrowserHostLongPolls = Math.max(0, this.activeBrowserHostLongPolls - 1)
      if (pairedDeviceId !== undefined) {
        const remaining = (this.activeBrowserHostLongPollsByDevice.get(pairedDeviceId) ?? 1) - 1
        if (remaining > 0) {
          this.activeBrowserHostLongPollsByDevice.set(pairedDeviceId, remaining)
        } else {
          this.activeBrowserHostLongPollsByDevice.delete(pairedDeviceId)
        }
      }
    }
  }

  protected parseAndAuth(rawMessage: string): { request: RpcRequest } | { error: RpcResponse } {
    let request: RpcRequest
    try {
      request = JSON.parse(rawMessage) as RpcRequest
    } catch {
      return { error: this.buildError('unknown', 'bad_request', 'Invalid JSON request') }
    }

    if (typeof request.id !== 'string' || request.id.length === 0) {
      return { error: this.buildError('unknown', 'bad_request', 'Missing request id') }
    }
    if (typeof request.method !== 'string' || request.method.length === 0) {
      return { error: this.buildError(request.id, 'bad_request', 'Missing RPC method') }
    }
    if (typeof request.authToken !== 'string' || request.authToken.length === 0) {
      return { error: this.buildError(request.id, 'unauthorized', 'Missing auth token') }
    }
    if (request.authToken !== this.authToken) {
      return { error: this.buildError(request.id, 'unauthorized', 'Invalid auth token') }
    }

    return { request }
  }

  protected buildError(id: string, code: string, message: string): RpcResponse {
    return errorResponse(id, { runtimeId: this.runtime.getRuntimeId() }, code, message)
  }

  protected writeMetadata(): void {
    const metadata: RuntimeMetadata = {
      remoteWorkspaceStreaming: 1,
      runtimeId: this.runtime.getRuntimeId(),
      terminalPresentationStreaming: 1,
      pid: this.pid,
      transports: this.transports,
      agentAwakeStreaming: 1,
      authToken: this.authToken,
      nativeChatStreaming: 1,
      structuredHeldStreaming: 1,
      agentStatusStreaming: 1,
      agentStatusMigrationStreaming: 1,
      agentWorkerRecoveryStreaming: 1,
      terminalEffectsStreaming: 1,
      terminalExitStreaming: 1,
      terminalSpawnStreaming: 1,
      terminalControlStreaming: 1,
      terminalModelRestoreStreaming: 1,
      rendererDeliveryResyncStreaming: 1,
      terminalRendererDataStreaming: 1,
      terminalRendererReplayStreaming: 1,
      terminalPreviewDataStreaming: 1,
      startedAt: this.runtime.getStartedAt()
    }
    writeRuntimeMetadata(this.userDataPath, metadata)
  }
}
