import { requireAccountsPermissionsExecutionHost } from '../accounts-permissions-host-boundary'
import { z } from 'zod'
import type { CommandHandler } from '../dispatch'
import { getOptionalNumberFlag } from '../flags'
import { RuntimeClientError } from '../runtime-client'
import { CodexObservedAccountsSchema, observeCodexAccountState } from '../codex-account-observer'

const WatchOptions = z
  .object({
    timeoutMs: z.number().int().min(250).max(3600000),
    intervalMs: z.number().int().min(250).max(60000)
  })
  .refine(
    ({ timeoutMs, intervalMs }) => intervalMs <= timeoutMs,
    'Interval must not exceed timeout'
  )
const LoginStatus = z.object({
  status: z.enum(['idle', 'pending', 'completed', 'cancelled', 'failed']),
  browserAuthorizationPending: z.boolean().optional()
})

const observeCodex: CommandHandler = async (ctx) => {
  requireAccountsPermissionsExecutionHost(ctx)
  const { client, flags, json } = ctx
  const timeoutMs = getOptionalNumberFlag(flags, 'timeout') ?? 30000
  const options = WatchOptions.parse({
    timeoutMs,
    intervalMs: getOptionalNumberFlag(flags, 'interval') ?? Math.min(1000, timeoutMs)
  })
  const controller = new AbortController()
  const onSigint = () => {
    process.exitCode = 130
    controller.abort()
  }
  const onSigterm = () => {
    process.exitCode = 143
    controller.abort()
  }
  process.on('SIGINT', onSigint)
  process.on('SIGTERM', onSigterm)
  let runtimeId: string | undefined
  try {
    await observeCodexAccountState(
      async (requestTimeoutMs, signal) => {
        const accounts = await client.call<unknown>(
          'accounts.list',
          { refreshUsage: false },
          { timeoutMs: requestTimeoutMs }
        )
        if (signal.aborted) {
          throw new RuntimeClientError('invalid_argument', 'Observation cancelled')
        }
        const login = await client.call<unknown>(
          'accounts.loginStatus',
          { provider: 'codex' },
          { timeoutMs: requestTimeoutMs }
        )
        if (
          accounts._meta.runtimeId !== login._meta.runtimeId ||
          (runtimeId !== undefined && accounts._meta.runtimeId !== runtimeId)
        ) {
          throw new RuntimeClientError(
            'invalid_environment',
            'Observed runtime changed; select the host again'
          )
        }
        runtimeId = accounts._meta.runtimeId
        const state = z.object({ codex: CodexObservedAccountsSchema }).parse(accounts.result)
        const status = LoginStatus.parse(login.result)
        return {
          accounts: state.codex,
          login: {
            status: status.status,
            browserAuthorizationPending: status.browserAuthorizationPending ?? null
          }
        }
      },
      (event) => {
        const output = { ...event, _meta: { runtimeId } }
        console.log(
          json
            ? JSON.stringify(output)
            : `${event.observedAt} ${event.event} ${JSON.stringify(output)}`
        )
      },
      { ...options, signal: controller.signal }
    )
  } finally {
    process.off('SIGINT', onSigint)
    process.off('SIGTERM', onSigterm)
  }
}
const observeCodexStream: CommandHandler = async (ctx) => {
  requireAccountsPermissionsExecutionHost(ctx)
  const { client, flags } = ctx
  const timeoutMs = getOptionalNumberFlag(flags, 'timeout') ?? 30000
  WatchOptions.parse({ timeoutMs, intervalMs: 250 })
  const controller = new AbortController()
  const onSigint = () => {
    process.exitCode = 130
    controller.abort()
  }
  const onSigterm = () => {
    process.exitCode = 143
    controller.abort()
  }
  process.on('SIGINT', onSigint)
  process.on('SIGTERM', onSigterm)
  const output = (event: unknown): void => console.log(JSON.stringify(event))
  try {
    const reason = await client.observeCodexLogin(timeoutMs, controller.signal, (event) =>
      output({
        event: event.type,
        pending: event.pending,
        revision: event.revision,
        observedAt: new Date().toISOString()
      })
    )
    output({ event: 'end', reason, observedAt: new Date().toISOString() })
  } finally {
    process.off('SIGINT', onSigint)
    process.off('SIGTERM', onSigterm)
  }
}

export const CODEX_ACCOUNT_OBSERVE_HANDLERS: Record<string, CommandHandler> = {
  'accounts observe-codex': observeCodex,
  'accounts observe-codex-stream': observeCodexStream
}
