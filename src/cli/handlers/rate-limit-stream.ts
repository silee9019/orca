import type { HandlerContext } from '../dispatch'
import { getOptionalPositiveIntegerFlag } from '../flags'
import { requireUsageExecutionHost } from '../usage-host-boundary'
import { RuntimeClientError } from '../runtime-client'
import { sanitizeRateLimitStreamFrame } from '../rate-limit-stream-frames'
export async function observeRateLimitStream(ctx: HandlerContext): Promise<void> {
  requireUsageExecutionHost(ctx)
  const count = getOptionalPositiveIntegerFlag(ctx.flags, 'count') ?? 10
  const timeout = getOptionalPositiveIntegerFlag(ctx.flags, 'timeout-ms') ?? 30000
  if (count > 1000 || timeout > 60000) {
    throw new RuntimeClientError(
      'invalid_argument',
      '--count must be at most 1000 and --timeout-ms at most 60000'
    )
  }
  const controller = new AbortController()
  const cancel = () => controller.abort()
  process.once('SIGINT', cancel)
  let received = 0
  let ready = false
  try {
    const result = await ctx.client.observeRateLimits(timeout, controller.signal, (input) => {
      const frame = sanitizeRateLimitStreamFrame(input)
      if ((!ready && frame.type !== 'ready') || (ready && frame.type === 'ready')) {
        throw new RuntimeClientError(
          'invalid_runtime_response',
          'Invalid rate-limit stream sequence'
        )
      }
      ready = true
      console.log(JSON.stringify(frame))
      if (frame.type === 'end' || ++received >= count) {
        controller.abort()
      }
    })
    console.log(JSON.stringify({ type: 'closed', reason: result }))
  } finally {
    process.removeListener('SIGINT', cancel)
  }
}
