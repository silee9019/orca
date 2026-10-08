import { z } from 'zod'
import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { RuntimeClientError, RuntimeRpcFailureError } from '../runtime-client'
import {
  BrowserDriverSnapshot,
  ClientHostedBrowserRowsSnapshot
} from '../../shared/rpc-contract/browser-reader-params'
const DriverKindRows = z.array(
  z.object({ browserPageId: z.string(), driver: z.object({ kind: z.string() }) })
)
function reader(kind: 'drivers' | 'rows'): CommandHandler {
  return async (ctx) => {
    let response
    try {
      response = await ctx.client.call<unknown>(
        kind === 'drivers' ? 'runtime.browserDrivers' : 'runtime.clientHostedBrowserRows'
      )
    } catch (error) {
      if (
        error instanceof RuntimeRpcFailureError &&
        ['method_not_found', 'unknown_method', 'invalid_params'].includes(error.code)
      ) {
        throw new RuntimeClientError(
          'incompatible_runtime',
          'This runtime does not support complete browser reader snapshots.'
        )
      }
      throw error
    }
    if (kind === 'drivers') {
      const kinds = DriverKindRows.safeParse(response.result)
      if (
        kinds.success &&
        kinds.data.some((row) => !['idle', 'desktop', 'mobile'].includes(row.driver.kind))
      ) {
        throw new RuntimeClientError(
          'incompatible_runtime',
          'This runtime returned an unsupported browser driver kind.'
        )
      }
    }
    const snapshot = (
      kind === 'drivers' ? BrowserDriverSnapshot : ClientHostedBrowserRowsSnapshot
    ).safeParse(response.result)
    if (!snapshot.success) {
      throw new RuntimeClientError(
        'runtime_error',
        'This runtime returned a malformed complete browser snapshot.'
      )
    }
    printResult(
      {
        id: response.id,
        ok: true,
        _meta: { runtimeId: response._meta.runtimeId },
        result: snapshot.data
      },
      ctx.json,
      (value) => JSON.stringify(value, null, 2)
    )
  }
}
export const BROWSER_READER_HANDLERS: Record<string, CommandHandler> = {
  'runtime browser-drivers': reader('drivers'),
  'runtime client-browser-rows': reader('rows')
}
