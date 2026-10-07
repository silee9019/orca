import type { CommandHandler } from '../dispatch'
import {
  getRequiredStringFlag,
  getRequiredStringFlagAllowingEmpty,
  getOptionalStringFlag,
  getOptionalNumberFlag
} from '../flags'
import { printResult } from '../format'
import { RuntimeClientError, RuntimeRpcFailureError } from '../runtime-client'
import {
  BrowserRemotePaneCommand,
  BrowserRemotePaneState
} from '../../shared/rpc-contract/browser-remote-pane-params'

export const BROWSER_REMOTE_PANE_HANDLERS: Record<string, CommandHandler> = {
  'browser remote-pane': async (ctx) => {
    if (ctx.client.isRemote || getRequiredStringFlag(ctx.flags, 'viewer') !== 'host') {
      throw new RuntimeClientError(
        'invalid_argument',
        'Remote pane controls require the local host viewer runtime.'
      )
    }
    const remotePage = getRequiredStringFlag(ctx.flags, 'remote-page')
    const action = getRequiredStringFlag(ctx.flags, 'action')
    const addressAction =
      action === 'address' ? getRequiredStringFlag(ctx.flags, 'address-action') : undefined
    const editorAction =
      action === 'markup-editor' ? getRequiredStringFlag(ctx.flags, 'editor-action') : undefined
    const command = BrowserRemotePaneCommand.safeParse({
      environmentId: getRequiredStringFlag(ctx.flags, 'runtime-environment'),
      expectedRemotePageId: remotePage === 'none' ? null : remotePage,
      action,
      markupAction: getOptionalStringFlag(ctx.flags, 'markup-action'),
      editor: {
        action: editorAction,
        value:
          editorAction === 'width' || editorAction === 'font-size'
            ? getOptionalNumberFlag(ctx.flags, 'value')
            : getOptionalStringFlag(ctx.flags, 'value'),
        text:
          editorAction === 'text-commit'
            ? getRequiredStringFlagAllowingEmpty(ctx.flags, 'text')
            : undefined
      },
      address: {
        action: addressAction,
        text:
          addressAction === 'draft'
            ? getRequiredStringFlagAllowingEmpty(ctx.flags, 'text')
            : undefined,
        index: getOptionalNumberFlag(ctx.flags, 'index')
      },
      x: getOptionalNumberFlag(ctx.flags, 'x'),
      y: getOptionalNumberFlag(ctx.flags, 'y'),
      button: getOptionalStringFlag(ctx.flags, 'button') ?? 'left',
      key: getOptionalStringFlag(ctx.flags, 'key'),
      navigation: getOptionalStringFlag(ctx.flags, 'navigation'),
      url: getOptionalStringFlag(ctx.flags, 'url'),
      failureAction: getOptionalStringFlag(ctx.flags, 'failure-action'),
      challengeId: getOptionalStringFlag(ctx.flags, 'challenge'),
      meta: ctx.flags.get('meta') === true,
      ctrl: ctx.flags.get('ctrl') === true,
      alt: ctx.flags.get('alt') === true,
      shift: ctx.flags.get('shift') === true
    })
    if (!command.success) {
      throw new RuntimeClientError('invalid_argument', 'Invalid remote browser pane command.')
    }
    let response
    try {
      response = await ctx.client.call<{ applied: boolean; remotePane?: unknown }>(
        'ui.browserViewer',
        {
          viewer: 'host',
          operation: 'remote-pane',
          page: getRequiredStringFlag(ctx.flags, 'page'),
          command: command.data
        }
      )
    } catch (error) {
      if (
        error instanceof RuntimeRpcFailureError &&
        ['method_not_found', 'unknown_method', 'invalid_params'].includes(error.code)
      ) {
        throw new RuntimeClientError(
          'incompatible_runtime',
          'This runtime does not support remote browser pane receipts.'
        )
      }
      throw error
    }
    const receipt = BrowserRemotePaneState.safeParse(response.result.remotePane)
    if (!receipt.success || !response.result.applied) {
      throw new RuntimeClientError(
        'runtime_error',
        'Remote browser pane did not return an applied owner receipt.'
      )
    }
    if (receipt.data.failure?.certificate?.ok === false) {
      throw new RuntimeClientError(
        'runtime_error',
        `Remote certificate proceed refused: ${receipt.data.failure.certificate.reason}`
      )
    }
    printResult(response, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
