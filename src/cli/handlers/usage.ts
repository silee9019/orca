import { requireUsageExecutionHost } from '../usage-host-boundary'
import type { z } from 'zod'
import type { CommandHandler, HandlerContext } from '../dispatch'
import {
  getOptionalStringFlag,
  getOptionalPositiveIntegerFlag,
  getRequiredStringFlag
} from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'
import {
  UsageProviderParams,
  UsageEnabledParams,
  UsageRefreshParams,
  UsageQueryParams,
  UsageSessionsParams,
  UsageBreakdownParams,
  UsageViewerParams
} from '../../shared/rpc-contract/usage-params'

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    throw new RuntimeClientError(
      'invalid_argument',
      parsed.error.issues[0]?.message ?? 'Invalid usage arguments'
    )
  }
  return parsed.data
}

function provider(ctx: HandlerContext) {
  return { provider: getRequiredStringFlag(ctx.flags, 'provider') }
}
function query(ctx: HandlerContext) {
  return {
    ...provider(ctx),
    scope: getOptionalStringFlag(ctx.flags, 'scope') ?? 'orca',
    range: getOptionalStringFlag(ctx.flags, 'range') ?? '30d'
  }
}
function booleanFlag(ctx: HandlerContext, flag: string, fallback?: boolean): boolean {
  if (flag === 'force' && ctx.flags.get(flag) === true) {
    return true
  }
  const value = getOptionalStringFlag(ctx.flags, flag)
  if (value === 'true') {
    return true
  }
  if (value === 'false') {
    return false
  }
  if (value === undefined && fallback !== undefined) {
    return fallback
  }
  throw new RuntimeClientError('invalid_argument', `--${flag} must be true or false`)
}
async function output(ctx: HandlerContext, method: string, params: unknown): Promise<void> {
  requireUsageExecutionHost(ctx)
  printResult(await ctx.client.call(method, params), ctx.json, (value) =>
    JSON.stringify(value, null, 2)
  )
}

export const USAGE_HANDLERS: Record<string, CommandHandler> = {
  'usage refresh-account-usage': (ctx) => {
    requireUsageExecutionHost(ctx)
    return output(
      ctx,
      'usage.viewerAction',
      parse(UsageViewerParams, {
        viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
        action: { action: 'refresh-account-usage', ...provider(ctx) }
      })
    )
  },
  'usage roster-signin': (ctx) => {
    requireUsageExecutionHost(ctx)
    return output(
      ctx,
      'usage.viewerAction',
      parse(UsageViewerParams, {
        viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
        action: { action: 'roster-signin', ...provider(ctx) }
      })
    )
  },
  'usage inline-signin': (ctx) => {
    requireUsageExecutionHost(ctx)
    return output(
      ctx,
      'usage.viewerAction',
      parse(UsageViewerParams, {
        viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
        action: {
          action: 'inline-signin',
          accountId: getRequiredStringFlag(ctx.flags, 'account-id'),
          target: {
            runtime: getRequiredStringFlag(ctx.flags, 'runtime'),
            wslDistro: getOptionalStringFlag(ctx.flags, 'wsl-distro') ?? null
          }
        }
      })
    )
  },
  'usage inline-signin-status': (ctx) => {
    requireUsageExecutionHost(ctx)
    return output(
      ctx,
      'usage.viewerAction',
      parse(UsageViewerParams, {
        viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
        action: {
          action: 'inline-signin-status',
          operationId: getRequiredStringFlag(ctx.flags, 'operation-id')
        }
      })
    )
  },
  'usage inline-signin-cancel': (ctx) => {
    requireUsageExecutionHost(ctx)
    return output(
      ctx,
      'usage.viewerAction',
      parse(UsageViewerParams, {
        viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
        action: {
          action: 'inline-signin-cancel',
          operationId: getRequiredStringFlag(ctx.flags, 'operation-id')
        }
      })
    )
  },
  'usage feature-wall-signin': (ctx) => {
    requireUsageExecutionHost(ctx)
    return output(
      ctx,
      'usage.viewerAction',
      parse(UsageViewerParams, {
        viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
        action: { action: 'feature-wall-signin', ...provider(ctx) }
      })
    )
  },
  'usage feature-wall-signin-status': (ctx) => {
    requireUsageExecutionHost(ctx)
    return output(
      ctx,
      'usage.viewerAction',
      parse(UsageViewerParams, {
        viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
        action: {
          action: 'feature-wall-signin-status',
          ...provider(ctx),
          operationId: getRequiredStringFlag(ctx.flags, 'operation-id')
        }
      })
    )
  },
  'usage feature-wall-signin-cancel': (ctx) => {
    requireUsageExecutionHost(ctx)
    return output(
      ctx,
      'usage.viewerAction',
      parse(UsageViewerParams, {
        viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
        action: {
          action: 'feature-wall-signin-cancel',
          ...provider(ctx),
          operationId: getRequiredStringFlag(ctx.flags, 'operation-id')
        }
      })
    )
  },
  'usage refresh-account-state': (ctx) => {
    requireUsageExecutionHost(ctx)
    return output(
      ctx,
      'usage.viewerAction',
      parse(UsageViewerParams, {
        viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
        action: { action: 'refresh-account-state' }
      })
    )
  },
  'usage percentage-settings': (ctx) => {
    requireUsageExecutionHost(ctx)
    return output(
      ctx,
      'usage.viewerAction',
      parse(UsageViewerParams, {
        viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
        action: { action: 'open-percentage-settings' }
      })
    )
  },
  'usage viewer-set-enabled': (ctx) => {
    requireUsageExecutionHost(ctx)
    return output(
      ctx,
      'usage.viewerAction',
      parse(UsageViewerParams, {
        viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
        action: { action: 'set-enabled', ...provider(ctx), enabled: booleanFlag(ctx, 'enabled') }
      })
    )
  },
  'usage viewer-refresh': (ctx) => {
    requireUsageExecutionHost(ctx)
    return output(
      ctx,
      'usage.viewerAction',
      parse(UsageViewerParams, {
        viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
        action: { action: 'refresh-provider', ...provider(ctx) }
      })
    )
  },
  'usage record-interaction': (ctx) => {
    requireUsageExecutionHost(ctx)
    return output(
      ctx,
      'usage.viewerAction',
      parse(UsageViewerParams, {
        viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
        action: { action: 'record-interaction' }
      })
    )
  },
  'usage skill-example': (ctx) => {
    requireUsageExecutionHost(ctx)
    return output(
      ctx,
      'usage.viewerAction',
      parse(UsageViewerParams, {
        viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
        action: {
          action: 'skill-example',
          skillCommand: getRequiredStringFlag(ctx.flags, 'skill-command'),
          exampleId: getRequiredStringFlag(ctx.flags, 'example-id'),
          operation: getRequiredStringFlag(ctx.flags, 'operation')
        }
      })
    )
  },
  'usage set-context-open': (ctx) => {
    requireUsageExecutionHost(ctx)
    const session = getOptionalStringFlag(ctx.flags, 'session-id')
    const pty = getOptionalStringFlag(ctx.flags, 'pty-id')
    if (Boolean(session) === Boolean(pty)) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Specify exactly one --session-id or --pty-id'
      )
    }
    return output(
      ctx,
      'usage.viewerAction',
      parse(UsageViewerParams, {
        viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
        action: {
          action: 'set-context-open',
          target: session ? { kind: 'session', id: session } : { kind: 'pty', id: pty },
          open: booleanFlag(ctx, 'open')
        }
      })
    )
  },
  'usage dismiss-notice': (ctx) => {
    requireUsageExecutionHost(ctx)
    return output(
      ctx,
      'usage.viewerAction',
      parse(UsageViewerParams, {
        viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
        action: { action: 'dismiss-notice', notice: getRequiredStringFlag(ctx.flags, 'notice') }
      })
    )
  },
  'usage set-menu-open': (ctx) => {
    requireUsageExecutionHost(ctx)
    return output(
      ctx,
      'usage.viewerAction',
      parse(UsageViewerParams, {
        viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
        action: {
          action: 'set-menu-open',
          open: booleanFlag(ctx, 'open'),
          focusPolicy: getOptionalStringFlag(ctx.flags, 'focus-policy')
        }
      })
    )
  },
  'usage share': (ctx) => {
    requireUsageExecutionHost(ctx)
    return output(
      ctx,
      'usage.viewerAction',
      parse(UsageViewerParams, {
        viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
        action: {
          action: 'share',
          ...provider(ctx),
          operation: getRequiredStringFlag(ctx.flags, 'operation')
        }
      })
    )
  },
  'usage select-tab': (ctx) => {
    requireUsageExecutionHost(ctx)
    return output(
      ctx,
      'usage.viewerAction',
      parse(UsageViewerParams, {
        viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
        action: { action: 'select-tab', tab: getRequiredStringFlag(ctx.flags, 'tab-id') }
      })
    )
  },
  'usage set-filters': (ctx) => {
    requireUsageExecutionHost(ctx)
    return output(
      ctx,
      'usage.viewerAction',
      parse(UsageViewerParams, {
        viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
        action: {
          action: 'set-filters',
          ...provider(ctx),
          scope: getOptionalStringFlag(ctx.flags, 'scope'),
          range: getOptionalStringFlag(ctx.flags, 'range')
        }
      })
    )
  },
  'usage set-display-mode': (ctx) => {
    requireUsageExecutionHost(ctx)
    return output(
      ctx,
      'usage.viewerAction',
      parse(UsageViewerParams, {
        viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
        action: { action: 'set-display-mode', mode: getRequiredStringFlag(ctx.flags, 'mode') }
      })
    )
  },
  'usage scan-state': (ctx) => {
    requireUsageExecutionHost(ctx)
    return output(ctx, 'usage.getScanState', parse(UsageProviderParams, provider(ctx)))
  },
  'usage set-enabled': (ctx) => {
    requireUsageExecutionHost(ctx)
    return output(
      ctx,
      'usage.setEnabled',
      parse(UsageEnabledParams, { ...provider(ctx), enabled: booleanFlag(ctx, 'enabled') })
    )
  },
  'usage refresh': (ctx) => {
    requireUsageExecutionHost(ctx)
    return output(
      ctx,
      'usage.refresh',
      parse(UsageRefreshParams, { ...provider(ctx), force: booleanFlag(ctx, 'force', false) })
    )
  },
  'usage snapshot': (ctx) => {
    requireUsageExecutionHost(ctx)
    return output(
      ctx,
      'usage.getSnapshot',
      parse(UsageSessionsParams, {
        ...query(ctx),
        limit: getOptionalPositiveIntegerFlag(ctx.flags, 'limit')
      })
    )
  },
  'usage summary': (ctx) => {
    requireUsageExecutionHost(ctx)
    return output(ctx, 'usage.getSummary', parse(UsageQueryParams, query(ctx)))
  },
  'usage daily': (ctx) => {
    requireUsageExecutionHost(ctx)
    return output(ctx, 'usage.getDaily', parse(UsageQueryParams, query(ctx)))
  },
  'usage breakdown': (ctx) => {
    requireUsageExecutionHost(ctx)
    return output(
      ctx,
      'usage.getBreakdown',
      parse(UsageBreakdownParams, { ...query(ctx), kind: getRequiredStringFlag(ctx.flags, 'kind') })
    )
  },
  'usage sessions': (ctx) => {
    requireUsageExecutionHost(ctx)
    return output(
      ctx,
      'usage.getRecentSessions',
      parse(UsageSessionsParams, {
        ...query(ctx),
        limit: getOptionalPositiveIntegerFlag(ctx.flags, 'limit')
      })
    )
  }
}
