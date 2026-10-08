import { rejectRemoteSelectionFlags } from '../remote-selection-flag-rejection'
import type { VerifyAndAddRuntimeEnvironmentResult } from '../../shared/remote-pairing-verification'
import type { CommandHandler, HandlerContext } from '../dispatch'
import { printResult } from '../format'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { RuntimeClientError } from '../runtime-client'
import { readConnectionInput, parseConnectionInput } from './connection-input'
import {
  EnvironmentBrowserPlacement,
  EnvironmentProbe,
  EnvironmentPairing,
  EnvironmentRemove
} from '../../shared/rpc-contract/environment-management-params'

async function call(ctx: HandlerContext, method: string, params?: unknown): Promise<void> {
  rejectRemoteSelectionFlags(
    ctx.flags,
    'runtime connection management. Run this command on the machine that owns these saved connections.'
  )
  try {
    const result = await ctx.client.call(method, params)
    printResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  } catch (error) {
    if (
      error instanceof RuntimeClientError &&
      ['unknown_method', 'method_not_found'].includes(error.code)
    ) {
      throw new RuntimeClientError(
        'incompatible_runtime',
        'Update Orca on the answering host to manage runtime connections.'
      )
    }
    throw error
  }
}
const selector = (ctx: HandlerContext): { selector: string } => ({
  selector: getRequiredStringFlag(ctx.flags, 'server')
})
export const ENVIRONMENT_CONNECTION_HANDLERS: Record<string, CommandHandler> = {
  'environment connection browser-placement': async (ctx) =>
    call(
      ctx,
      'environment.management.prepareBrowserPlacement',
      parseConnectionInput(EnvironmentBrowserPlacement, {
        ...selector(ctx),
        preference: getOptionalStringFlag(ctx.flags, 'preference') ?? 'auto',
        ...(ctx.flags.has('pairing-revision')
          ? {
              expectedPairingRevision: Number(getRequiredStringFlag(ctx.flags, 'pairing-revision'))
            }
          : {})
      })
    ),
  'environment connection probe': async (ctx) =>
    call(
      ctx,
      'environment.management.probe',
      parseConnectionInput(EnvironmentProbe, {
        ...selector(ctx),
        ...(ctx.flags.has('observe-only') ? { observeOnly: true } : {})
      })
    ),
  'environment connection list': async (ctx) => call(ctx, 'environment.management.list'),
  'environment connection show': async (ctx) =>
    call(ctx, 'environment.management.resolve', selector(ctx)),
  'environment connection add': addRuntimeEnvironmentConnection,
  'environment connection connect': async (ctx) =>
    call(ctx, 'environment.management.connect', selector(ctx)),
  'environment connection disconnect': async (ctx) =>
    call(ctx, 'environment.management.disconnect', selector(ctx)),
  'environment connection status': async (ctx) => call(ctx, 'environment.management.status'),
  'environment connection rm': (ctx) => removeRuntimeEnvironmentConnection(ctx)
}

export async function addRuntimeEnvironmentConnection(
  ctx: HandlerContext,
  allowLegacyPairingInput = false
): Promise<void> {
  if (allowLegacyPairingInput) {
    const selectionFlags = new Map(ctx.flags)
    selectionFlags.delete('pairing-code')
    rejectRemoteSelectionFlags(selectionFlags, 'runtime connection management.')
  } else {
    rejectRemoteSelectionFlags(
      ctx.flags,
      'runtime connection management. Use a private pairing input file or stdin.'
    )
  }
  const legacyPairingCode = getOptionalStringFlag(ctx.flags, 'pairing-code')
  const privateInput = ctx.flags.has('input-file') || ctx.flags.has('input-stdin')
  if (Boolean(legacyPairingCode) === privateInput) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Choose exactly one pairing input: --input-file, --input-stdin, or legacy --pairing-code'
    )
  }
  const pairingCode = legacyPairingCode ?? (await readConnectionInput(ctx.flags)).trim()
  const params = parseConnectionInput(EnvironmentPairing, {
    name: getRequiredStringFlag(ctx.flags, 'name'),
    pairingCode,
    allowLoopback: ctx.flags.has('allow-loopback')
  })
  const response = await ctx.client.call<VerifyAndAddRuntimeEnvironmentResult>(
    'environment.management.verifyAndAdd',
    params
  )
  if (!response.result.ok) {
    throw new RuntimeClientError(
      'connection_verification_failed',
      `Runtime pairing verification failed: ${response.result.kind}`
    )
  }
  printResult(response, ctx.json, (value) => JSON.stringify(value, null, 2))
}
export async function removeRuntimeEnvironmentConnection(
  ctx: HandlerContext,
  selectorFlag: 'server' | 'environment' = 'server'
): Promise<void> {
  const params = parseConnectionInput(EnvironmentRemove, {
    selector: getRequiredStringFlag(ctx.flags, selectorFlag),
    confirmTarget: getRequiredStringFlag(ctx.flags, 'confirm-target')
  })
  if (selectorFlag === 'server') {
    rejectRemoteSelectionFlags(ctx.flags, 'runtime connection management.')
  }
  const response = await ctx.client.call('environment.management.remove', params)
  printResult(response, ctx.json, (value) => JSON.stringify(value, null, 2))
}
