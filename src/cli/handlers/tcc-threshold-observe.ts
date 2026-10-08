import { requireAccountsPermissionsExecutionHost } from '../accounts-permissions-host-boundary'
import { z } from 'zod'
import type { CommandHandler } from '../dispatch'
import { getOptionalNumberFlag } from '../flags'
const Frame = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('ready'),
      promptCount: z.number().int().nonnegative(),
      pending: z.boolean(),
      dismissed: z.boolean(),
      acknowledged: z.boolean()
    })
    .strict(),
  z.object({ type: z.literal('threshold'), promptCount: z.number().int().positive() }).strict()
])
const observe: CommandHandler = async (ctx) => {
  requireAccountsPermissionsExecutionHost(ctx)
  const { client, flags } = ctx
  const timeout = z
    .number()
    .int()
    .min(250)
    .max(3600000)
    .parse(getOptionalNumberFlag(flags, 'timeout') ?? 30000)
  const controller = new AbortController()
  const stop = () => {
    process.exitCode = 130
    controller.abort()
  }
  const terminate = () => {
    process.exitCode = 143
    controller.abort()
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', terminate)
  let ready = false
  try {
    const reason = await client.observeTccThreshold(timeout, controller.signal, (input) => {
      const frame = Frame.parse(input)
      if (frame.type !== (ready ? 'threshold' : 'ready')) {
        throw new Error('Unexpected TCC observation frame')
      }
      ready = true
      console.log(JSON.stringify({ ...frame, observedAt: new Date().toISOString() }))
    })
    console.log(JSON.stringify({ type: 'end', reason, observedAt: new Date().toISOString() }))
  } finally {
    process.off('SIGINT', stop)
    process.off('SIGTERM', terminate)
  }
}
export const TCC_THRESHOLD_OBSERVE_HANDLERS: Record<string, CommandHandler> = {
  'permissions tcc observe': observe
}
