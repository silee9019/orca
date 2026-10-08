import { z } from 'zod'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError, RuntimeRpcFailureError } from '../runtime-client'
import {
  BrowserObservationCommand,
  BrowserObservationState
} from '../../shared/rpc-contract/browser-observation-params'
const ObservedDriverKind = z.object({
  kind: z.literal('driver'),
  page: z.string(),
  worktreeId: z.string(),
  changed: z.boolean(),
  driver: z.object({ kind: z.string() })
})
function observe(kind: BrowserObservationCommand['kind']): CommandHandler {
  return async (ctx) => {
    if (ctx.client.isRemote || getRequiredStringFlag(ctx.flags, 'viewer') !== 'host') {
      throw new RuntimeClientError(
        'invalid_argument',
        'Observation requires the local host viewer runtime.'
      )
    }
    const parsed = BrowserObservationCommand.safeParse({
      kind,
      page: getRequiredStringFlag(ctx.flags, 'page'),
      worktreeId: getRequiredStringFlag(ctx.flags, 'worktree'),
      waitMs: ctx.flags.has('wait-ms') ? Number(getRequiredStringFlag(ctx.flags, 'wait-ms')) : 0
    })
    if (!parsed.success) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Observation wait must be an integer from zero through 5000 milliseconds.'
      )
    }
    const command = parsed.data
    let response
    try {
      response = await ctx.client.call<{ applied: boolean; page?: string; observation?: unknown }>(
        'ui.browserViewer',
        { viewer: 'host', operation: 'observe-page', command }
      )
    } catch (error) {
      if (
        error instanceof RuntimeRpcFailureError &&
        ['method_not_found', 'unknown_method', 'invalid_params'].includes(error.code)
      ) {
        throw new RuntimeClientError(
          'incompatible_runtime',
          'This runtime does not support browser observation receipts.'
        )
      }
      throw error
    }
    const receipt = BrowserObservationState.safeParse(response.result.observation)
    const driverKind = ObservedDriverKind.safeParse(response.result.observation)
    if (
      kind === 'driver' &&
      response.result.applied &&
      response.result.page === command.page &&
      driverKind.success &&
      driverKind.data.page === command.page &&
      driverKind.data.worktreeId === command.worktreeId &&
      !['idle', 'desktop', 'mobile'].includes(driverKind.data.driver.kind)
    ) {
      throw new RuntimeClientError(
        'incompatible_runtime',
        'This CLI does not support the reported browser driver kind.'
      )
    }
    if (
      !response.result.applied ||
      response.result.page !== command.page ||
      !receipt.success ||
      receipt.data.page !== command.page ||
      receipt.data.worktreeId !== command.worktreeId ||
      receipt.data.kind !== kind
    ) {
      throw new RuntimeClientError(
        'runtime_error',
        'Observation did not return the exact viewer target receipt.'
      )
    }
    printResult(
      {
        id: response.id,
        ok: true,
        _meta: { runtimeId: response._meta.runtimeId },
        result: { applied: true, page: receipt.data.page, observation: receipt.data }
      },
      ctx.json,
      (value) => JSON.stringify(value, null, 2)
    )
  }
}
export const BROWSER_OBSERVATION_HANDLERS: Record<string, CommandHandler> = {
  'browser observe': observe('visibility'),
  'runtime browser-observe': observe('driver')
}
