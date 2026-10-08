import { observeRateLimitStream } from './rate-limit-stream'
import { requireUsageExecutionHost } from '../usage-host-boundary'
import { setTimeout } from 'node:timers/promises'
import type { CommandHandler, HandlerContext } from '../dispatch'
import {
  getOptionalStringFlag,
  getRequiredStringFlag,
  getOptionalPositiveIntegerFlag,
  getOptionalJsonFlag
} from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'
import {
  RateLimitTargetParams,
  RateLimitPollingParams
} from '../../shared/rpc-contract/usage-params'
import { ConsumeCodexResetCreditParams } from '../../shared/rpc-contract/accounts-params'

async function output(ctx: HandlerContext, method: string, params?: unknown): Promise<void> {
  requireUsageExecutionHost(ctx)
  printResult(await ctx.client.call(method, params), ctx.json, (value) =>
    JSON.stringify(value, null, 2)
  )
}

export const RATE_LIMIT_HANDLERS: Record<string, CommandHandler> = {
  'rate-limit observe-stream': observeRateLimitStream,
  'rate-limit get': (ctx) => {
    requireUsageExecutionHost(ctx)
    return output(ctx, 'rateLimits.get')
  },
  'rate-limit refresh': (ctx) => {
    requireUsageExecutionHost(ctx)
    const provider = getOptionalStringFlag(ctx.flags, 'provider') ?? 'all'
    if (provider === 'all') {
      return output(ctx, 'rateLimits.refresh')
    }
    if (provider === 'minimax') {
      return output(ctx, 'rateLimits.refreshMiniMax')
    }
    if (provider === 'grok') {
      return output(ctx, 'rateLimits.refreshGrok')
    }
    throw new RuntimeClientError('invalid_argument', '--provider must be all, minimax or grok')
  },
  'rate-limit refresh-target': (ctx) => {
    requireUsageExecutionHost(ctx)
    const provider = getRequiredStringFlag(ctx.flags, 'provider')
    if (provider !== 'claude' && provider !== 'codex') {
      throw new RuntimeClientError('invalid_argument', '--provider must be claude or codex')
    }
    const params = RateLimitTargetParams.safeParse({
      target: {
        runtime: getRequiredStringFlag(ctx.flags, 'runtime'),
        wslDistro: getOptionalStringFlag(ctx.flags, 'wsl-distro') ?? null
      }
    })
    if (!params.success) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Use --runtime host, or --runtime wsl --wsl-distro <name>'
      )
    }
    return output(
      ctx,
      provider === 'claude'
        ? 'rateLimits.refreshClaudeForTarget'
        : 'rateLimits.refreshCodexForTarget',
      params.data
    )
  },
  'rate-limit set-polling-interval': (ctx) => {
    requireUsageExecutionHost(ctx)
    const params = RateLimitPollingParams.safeParse({
      ms: getOptionalPositiveIntegerFlag(ctx.flags, 'ms')
    })
    if (!params.success) {
      throw new RuntimeClientError('invalid_argument', '--ms must be a positive integer')
    }
    return output(ctx, 'rateLimits.setPollingInterval', params.data)
  },
  'rate-limit fetch-inactive': (ctx) => {
    requireUsageExecutionHost(ctx)
    const provider = getRequiredStringFlag(ctx.flags, 'provider')
    if (provider === 'claude') {
      return output(ctx, 'rateLimits.fetchInactiveClaudeAccounts')
    }
    if (provider === 'codex') {
      return output(ctx, 'rateLimits.fetchInactiveCodexAccounts')
    }
    throw new RuntimeClientError('invalid_argument', '--provider must be claude or codex')
  },
  'rate-limit consume-codex-reset-credit': (ctx) => {
    requireUsageExecutionHost(ctx)
    let scope: unknown
    try {
      scope = JSON.parse(getOptionalJsonFlag(ctx.flags, 'expected-scope') ?? '')
    } catch {
      throw new RuntimeClientError(
        'invalid_argument',
        '--expected-scope must contain the exact reset offer JSON'
      )
    }
    const params = ConsumeCodexResetCreditParams.safeParse({
      idempotencyKey: getRequiredStringFlag(ctx.flags, 'idempotency-key'),
      expectedScope: scope
    })
    if (!params.success) {
      throw new RuntimeClientError('invalid_argument', 'Invalid Codex reset key or expected scope')
    }
    return output(ctx, 'accounts.consumeCodexResetCredit', params.data)
  },
  'rate-limit observe': async (ctx) => {
    requireUsageExecutionHost(ctx)
    const count = getOptionalPositiveIntegerFlag(ctx.flags, 'count') ?? 10
    const interval = getOptionalPositiveIntegerFlag(ctx.flags, 'interval-ms') ?? 1000
    if (count > 1000 || interval > 2147483647) {
      throw new RuntimeClientError(
        'invalid_argument',
        '--count must be at most 1000 and --interval-ms at most 2147483647'
      )
    }
    for (let index = 0; index < count; index++) {
      if (index > 0) {
        await setTimeout(interval)
      }
      await output(ctx, 'rateLimits.get')
    }
  }
}
