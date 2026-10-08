import { rejectRemoteSelectionFlags } from '../remote-selection-flag-rejection'
import { parseConnectionInput } from './connection-input'
import { open, unlink } from 'node:fs/promises'
import { restrictWindowsPathSync } from '../../shared/secure-path-windows-acl'
import type { CommandHandler, HandlerContext } from '../dispatch'
import { printResult } from '../format'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { RuntimeClientError } from '../runtime-client'
import {
  MobilePairingParams,
  MobileRevokeParams,
  RuntimePairingParams
} from '../../shared/rpc-contract/mobile-connection-params'

async function call(ctx: HandlerContext, method: string, params?: unknown): Promise<void> {
  try {
    const response = await ctx.client.call(method, params)
    printResult(response, ctx.json, (value) => JSON.stringify(value, null, 2))
  } catch (error) {
    if (
      error instanceof RuntimeClientError &&
      ['unknown_method', 'method_not_found'].includes(error.code)
    ) {
      throw new RuntimeClientError(
        'incompatible_runtime',
        'Update Orca on the answering host to manage mobile connections.'
      )
    }
    throw error
  }
}
async function pairing(ctx: HandlerContext, method: string, params: unknown): Promise<void> {
  const file = getRequiredStringFlag(ctx.flags, 'output-file')
  const output = await open(file, 'wx', 0o600)
  try {
    if (process.platform === 'win32' && !restrictWindowsPathSync(file, false)) {
      throw new RuntimeClientError(
        'private_output_unprotected',
        'Cannot verify private pairing output permissions.'
      )
    }
    const response = await ctx.client.call(method, params)
    await output.writeFile(`${JSON.stringify(response.result)}\n`)
    printResult(
      { ...response, result: { outputFile: file } },
      ctx.json,
      (value) => `Pairing details saved to ${value.outputFile}`
    )
  } catch (error) {
    await output.close()
    await unlink(file)
    throw error
  } finally {
    await output.close()
  }
}
function revokedDevice(ctx: HandlerContext): { deviceId: string; confirmTarget: string } {
  return parseConnectionInput(MobileRevokeParams, {
    deviceId: getRequiredStringFlag(ctx.flags, 'device'),
    confirmTarget: getRequiredStringFlag(ctx.flags, 'confirm-target')
  })
}
export const MOBILE_CONNECTION_HANDLERS: Record<string, CommandHandler> = {
  'mobile relay watch': async (ctx) => {
    rejectRemoteSelectionFlags(ctx.flags, 'local mobile relay observation.')
    const abort = new AbortController()
    const stop = (): void => abort.abort()
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
    try {
      const result = await ctx.client.watchConnections({
        durationMs: Number(getOptionalStringFlag(ctx.flags, 'duration-ms') ?? '1000'),
        limit: Number(getOptionalStringFlag(ctx.flags, 'limit') ?? '100'),
        observeMobileRelay: true,
        signal: abort.signal
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
  },
  'mobile network': async (ctx) => call(ctx, 'mobile.connection.networkInterfaces'),
  'mobile status': async (ctx) => call(ctx, 'mobile.connection.status'),
  'mobile relay': async (ctx) => call(ctx, 'mobile.connection.relay'),
  'mobile devices': async (ctx) => call(ctx, 'mobile.connection.devices'),
  'mobile grants': async (ctx) => call(ctx, 'mobile.connection.grants'),
  'mobile device revoke': async (ctx) =>
    call(ctx, 'mobile.connection.revokeDevice', revokedDevice(ctx)),
  'mobile grant revoke': async (ctx) =>
    call(ctx, 'mobile.connection.revokeGrant', revokedDevice(ctx)),
  'mobile firewall status': async (ctx) =>
    call(ctx, 'mobile.connection.firewall', {
      address: getOptionalStringFlag(ctx.flags, 'address')
    }),
  'mobile pairing create': async (ctx) =>
    pairing(
      ctx,
      'mobile.connection.pairing',
      parseConnectionInput(MobilePairingParams, {
        address: getOptionalStringFlag(ctx.flags, 'address'),
        connectionMode: getRequiredStringFlag(ctx.flags, 'mode'),
        rotate: ctx.flags.has('rotate')
      })
    ),
  'mobile runtime-pairing create': async (ctx) =>
    pairing(
      ctx,
      'mobile.connection.runtimePairing',
      parseConnectionInput(RuntimePairingParams, {
        address: getOptionalStringFlag(ctx.flags, 'address'),
        reach: getRequiredStringFlag(ctx.flags, 'reach'),
        rotate: ctx.flags.has('rotate')
      })
    )
}
