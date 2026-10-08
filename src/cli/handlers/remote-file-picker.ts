import type { CommandHandler } from '../dispatch'
import {
  getRequiredStringFlag,
  getRequiredStringFlagAllowingEmpty,
  getOptionalStringFlag
} from '../flags'
import { printResult } from '../format'
import { RuntimeClientError, RuntimeRpcFailureError } from '../runtime-client'
import {
  RemoteFilePickerCommand,
  RemoteFilePickerState
} from '../../shared/rpc-contract/remote-file-picker-params'
export const REMOTE_FILE_PICKER_HANDLERS: Record<string, CommandHandler> = {
  'file remote-picker': async (ctx) => {
    if (ctx.client.isRemote || getRequiredStringFlag(ctx.flags, 'viewer') !== 'host') {
      throw new RuntimeClientError(
        'invalid_argument',
        'Picker controls require the local host viewer runtime.'
      )
    }
    const command = RemoteFilePickerCommand.safeParse({
      target: {
        kind: getRequiredStringFlag(ctx.flags, 'target-kind'),
        id: getRequiredStringFlag(ctx.flags, 'target')
      },
      action: getRequiredStringFlag(ctx.flags, 'action'),
      instance: getOptionalStringFlag(ctx.flags, 'picker-instance'),
      path: getOptionalStringFlag(ctx.flags, 'path'),
      text: ctx.flags.has('text')
        ? getRequiredStringFlagAllowingEmpty(ctx.flags, 'text')
        : undefined,
      key: getOptionalStringFlag(ctx.flags, 'key'),
      entry: getOptionalStringFlag(ctx.flags, 'entry')
    })
    if (!command.success) {
      throw new RuntimeClientError('invalid_argument', 'Invalid remote picker command.')
    }
    let response
    try {
      response = await ctx.client.call<{ applied: boolean; remotePicker?: unknown }>(
        'ui.browserViewer',
        { viewer: 'host', operation: 'remote-picker', command: command.data }
      )
    } catch (error) {
      if (
        error instanceof RuntimeRpcFailureError &&
        ['method_not_found', 'unknown_method', 'invalid_params'].includes(error.code)
      ) {
        throw new RuntimeClientError(
          'incompatible_runtime',
          'This runtime does not support directory picker receipts.'
        )
      }
      throw error
    }
    const receipt = RemoteFilePickerState.safeParse(response.result.remotePicker)
    if (!receipt.success || !response.result.applied) {
      throw new RuntimeClientError(
        'runtime_error',
        'Picker did not return an applied owner receipt.'
      )
    }
    printResult(response, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
