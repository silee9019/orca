import type { CommandHandler, HandlerContext } from '../dispatch'
import { printResult } from '../format'
import { getRequiredStringFlag, getOptionalStringFlag } from '../flags'
import { RuntimeClientError } from '../runtime-client'
import { readConnectionInput, readConnectionJson, parseConnectionInput } from './connection-input'
import * as schemas from '../../shared/rpc-contract/ssh-management-params'
import type { z } from 'zod'
import { rejectRemoteSelectionFlags } from '../remote-selection-flag-rejection'

async function call(context: HandlerContext, method: string, params?: unknown): Promise<void> {
  try {
    const result = await context.client.call(method, params)
    printResult(result, context.json, (value) => JSON.stringify(value, null, 2))
  } catch (error) {
    if (
      error instanceof RuntimeClientError &&
      ['unknown_method', 'method_not_found'].includes(error.code)
    ) {
      throw new RuntimeClientError(
        'incompatible_runtime',
        'This runtime does not support SSH management. Update Orca on the answering host.'
      )
    }
    throw error
  }
}
function target(context: HandlerContext): { targetId: string } {
  return { targetId: getRequiredStringFlag(context.flags, 'target') }
}
function confirmedTarget(
  context: HandlerContext
): z.infer<typeof schemas.SshManagedDestructiveTarget> {
  const value = {
    ...target(context),
    confirmTarget: getRequiredStringFlag(context.flags, 'confirm-target')
  }
  return parseConnectionInput(schemas.SshManagedDestructiveTarget, value, 'confirm_target_mismatch')
}

async function runSshWatch(
  ctx: HandlerContext,
  topic: 'state' | 'credentials' | 'forwards' | 'detected' = 'state'
): Promise<void> {
  rejectRemoteSelectionFlags(ctx.flags, 'local SSH management observation.')
  const abort = new AbortController()
  const stop = (): void => abort.abort()
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  try {
    const result = await ctx.client.watchSshState({
      durationMs: Number(getOptionalStringFlag(ctx.flags, 'duration-ms') ?? '1000'),
      limit: Number(getOptionalStringFlag(ctx.flags, 'limit') ?? '100'),
      targetId: getOptionalStringFlag(ctx.flags, 'target'),
      signal: abort.signal,
      observeCredentials: topic === 'credentials',
      observePorts: topic === 'forwards' || topic === 'detected' ? topic : undefined
    })
    printResult(
      { id: result.requestId, ok: true, result, _meta: { runtimeId: result.runtimeId } },
      ctx.json,
      (value) => JSON.stringify(value, null, 2)
    )
  } finally {
    process.removeListener('SIGINT', stop)
    process.removeListener('SIGTERM', stop)
  }
}

export const SSH_HANDLERS: Record<string, CommandHandler> = {
  'ssh watch': (ctx) => runSshWatch(ctx),
  'ssh forward watch': (ctx) => runSshWatch(ctx, 'forwards'),
  'ssh ports watch': (ctx) => runSshWatch(ctx, 'detected'),
  'ssh credential watch': (ctx) => runSshWatch(ctx, 'credentials'),
  'ssh browse': async (ctx) =>
    call(ctx, 'ssh.management.browseDir', {
      ...target(ctx),
      dirPath: getRequiredStringFlag(ctx.flags, 'path')
    }),
  'ssh credential list': async (ctx) => call(ctx, 'ssh.management.credentialRequests'),
  'ssh target list': async (ctx) => call(ctx, 'ssh.listTargets'),
  'ssh target add': async (ctx) =>
    call(
      ctx,
      'ssh.management.addTarget',
      parseConnectionInput(schemas.SshManagedAddTarget, {
        target: await readConnectionJson(ctx.flags)
      })
    ),
  'ssh target update': async (ctx) =>
    call(
      ctx,
      'ssh.management.updateTarget',
      parseConnectionInput(schemas.SshManagedUpdateTarget, {
        id: target(ctx).targetId,
        updates: await readConnectionJson(ctx.flags)
      })
    ),
  'ssh target rm': async (ctx) => call(ctx, 'ssh.management.removeTarget', confirmedTarget(ctx)),
  'ssh target removed': async (ctx) => call(ctx, 'ssh.management.listRemovedTargetLabels'),
  'ssh config list': async (ctx) =>
    call(
      ctx,
      'ssh.management.listConfigHosts',
      parseConnectionInput(schemas.SshManagedConfigQuery, {
        query: getOptionalStringFlag(ctx.flags, 'query'),
        refresh: ctx.flags.has('refresh')
      })
    ),
  'ssh config resolve': async (ctx) =>
    call(ctx, 'ssh.management.resolveConfigHost', {
      alias: getRequiredStringFlag(ctx.flags, 'alias')
    }),
  'ssh config import': async (ctx) =>
    call(ctx, 'ssh.management.importConfig', { reAdopt: ctx.flags.has('re-adopt') }),
  'ssh connect': async (ctx) => call(ctx, 'ssh.connect', target(ctx)),
  'ssh disconnect': async (ctx) => call(ctx, 'ssh.management.disconnect', target(ctx)),
  'ssh status': async (ctx) => call(ctx, 'ssh.getState', target(ctx)),
  'ssh test': async (ctx) => call(ctx, 'ssh.management.testConnection', target(ctx)),
  'ssh reset': async (ctx) => call(ctx, 'ssh.management.resetRelay', confirmedTarget(ctx)),
  'ssh terminate': async (ctx) =>
    call(ctx, 'ssh.management.terminateSessions', confirmedTarget(ctx)),
  'ssh credential required': async (ctx) =>
    call(ctx, 'ssh.management.needsPassphrasePrompt', target(ctx)),
  'ssh credential submit': async (ctx) =>
    call(
      ctx,
      'ssh.management.submitCredential',
      parseConnectionInput(schemas.SshManagedCredential, {
        requestId: getRequiredStringFlag(ctx.flags, 'request'),
        value: await readConnectionInput(ctx.flags)
      })
    ),
  'ssh credential cancel': async (ctx) =>
    call(ctx, 'ssh.management.submitCredential', {
      requestId: getRequiredStringFlag(ctx.flags, 'request'),
      value: null
    }),
  'ssh forward list': async (ctx) => call(ctx, 'ssh.management.listPortForwards', target(ctx)),
  'ssh forward add': async (ctx) =>
    call(
      ctx,
      'ssh.management.addPortForward',
      parseConnectionInput(schemas.SshManagedAddForward, {
        ...(await connectionRecord(ctx)),
        ...target(ctx)
      })
    ),
  'ssh forward update': async (ctx) =>
    call(
      ctx,
      'ssh.management.updatePortForward',
      parseConnectionInput(schemas.SshManagedUpdateForward, {
        ...(await connectionRecord(ctx)),
        ...target(ctx),
        id: getRequiredStringFlag(ctx.flags, 'forward')
      })
    ),
  'ssh forward rm': async (ctx) =>
    call(ctx, 'ssh.management.removePortForward', {
      ...confirmedTarget(ctx),
      id: getRequiredStringFlag(ctx.flags, 'forward')
    }),
  'ssh ports': async (ctx) => call(ctx, 'ssh.management.listDetectedPorts', target(ctx))
}

async function connectionRecord(ctx: HandlerContext): Promise<Record<string, unknown>> {
  const input = await readConnectionJson(ctx.flags)
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new RuntimeClientError('invalid_argument', 'Connection input must be a JSON object')
  }
  return Object.fromEntries(Object.entries(input))
}
