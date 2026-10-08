import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { CommandHandler } from '../dispatch'
import type { NativeChatSubscription } from '../runtime/native-chat-subscription'
import { RuntimeClientError, RuntimeRpcFailureError } from '../runtime/types'
import { NativeChatWatchRequest } from '../../shared/rpc-contract/native-chat-watch'
import { readAgentSessionRequest } from './agent-session-request'

export const NATIVE_CHAT_WATCH_HANDLERS: Record<string, CommandHandler> = {
  'agent history watch': async (ctx) => {
    const { watchMs, ...session } = await readAgentSessionRequest(ctx, NativeChatWatchRequest)
    const controller = new AbortController()
    let subscription: NativeChatSubscription | undefined
    let timer: NodeJS.Timeout | undefined
    let receivedFrames = 0
    let interrupted = 0
    type Outcome =
      | { reason: 'timeout' | 'interrupted' | 'host-end'; error?: never }
      | { error: Error; reason?: never }
    let finish: (outcome: Outcome) => void = () => {}
    const completed = new Promise<Outcome>((resolve) => {
      finish = resolve
    })
    const interrupt = (): void => {
      interrupted = 130
      finish({ reason: 'interrupted' })
      controller.abort()
    }
    const terminate = (): void => {
      interrupted = 143
      finish({ reason: 'interrupted' })
      controller.abort()
    }
    process.on('SIGINT', interrupt)
    process.on('SIGTERM', terminate)
    try {
      subscription = await ctx.client.subscribeNativeChat(
        { ...session, subscriptionId: randomUUID(), capabilities: { transcriptPending: 1 } },
        {
          onResponse: (response) => {
            if (!response.ok) {
              finish({ error: new RuntimeRpcFailureError(response) })
              return
            }
            const frame = z.object({ type: z.string() }).passthrough().safeParse(response.result)
            if (!frame.success) {
              finish({
                error: new RuntimeClientError(
                  'invalid_runtime_response',
                  'The host returned an invalid transcript event.'
                )
              })
              return
            }
            if (typeof frame.data.error === 'string' && frame.data.error) {
              finish({
                error: new RuntimeClientError(
                  'transcript_unavailable',
                  'The selected host could not read its transcript.'
                )
              })
              return
            }
            receivedFrames += 1
            console.log(JSON.stringify(response.result))
            if (frame.data.type === 'end') {
              finish({ reason: 'host-end' })
            }
          },
          onError: (error) => finish({ error }),
          onClose: () =>
            finish({
              error: new RuntimeClientError(
                'runtime_unavailable',
                'The transcript connection closed without a host end frame.'
              )
            })
        },
        controller.signal
      )
      timer = setTimeout(() => finish({ reason: 'timeout' }), watchMs)
      const outcome = await completed
      if (outcome.error) {
        throw outcome.error
      }
      process.exitCode = interrupted
      console.log(
        JSON.stringify({
          type: 'watch-ended',
          reason: outcome.reason,
          receivedFrames,
          transcriptComplete: false
        })
      )
    } catch (error) {
      if (!interrupted) {
        throw error
      }
      process.exitCode = interrupted
      console.log(
        JSON.stringify({
          type: 'watch-ended',
          reason: 'interrupted',
          receivedFrames,
          transcriptComplete: false
        })
      )
    } finally {
      if (timer) {
        clearTimeout(timer)
      }
      process.removeListener('SIGINT', interrupt)
      process.removeListener('SIGTERM', terminate)
      subscription?.close()
      controller.abort()
    }
  }
}
