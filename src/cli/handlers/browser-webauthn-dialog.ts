import { readFile, stat } from 'node:fs/promises'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError, RuntimeRpcFailureError } from '../runtime-client'
import {
  BrowserWebAuthnDialogTarget,
  BrowserWebAuthnDialogState
} from '../../shared/rpc-contract/browser-webauthn-dialog-params'
export const BROWSER_WEBAUTHN_DIALOG_HANDLERS: Record<string, CommandHandler> = {
  'browser webauthn dialog-respond': async (ctx) => {
    const cancel = ctx.flags.get('cancel') === true
    const file = ctx.flags.get('credential-file')
    if (
      ctx.client.isRemote ||
      getRequiredStringFlag(ctx.flags, 'viewer') !== 'host' ||
      ctx.flags.get('confirm') !== true ||
      cancel === (typeof file === 'string')
    ) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Require host viewer, --confirm and exactly one of --cancel or --credential-file.'
      )
    }
    let credentialId: string | null = null
    if (typeof file === 'string') {
      try {
        if ((await stat(file)).size > 4096) {
          throw new Error('too large')
        }
        credentialId = (await readFile(file, 'utf8')).trim()
      } catch {
        throw new RuntimeClientError(
          'invalid_argument',
          'Could not read credential file (maximum 4096 bytes).'
        )
      }
    }
    const target = BrowserWebAuthnDialogTarget.safeParse({
      clientTarget: ctx.flags.has('remote-page')
        ? {
            remotePageId: getRequiredStringFlag(ctx.flags, 'remote-page'),
            browserHostClientId: getRequiredStringFlag(ctx.flags, 'browser-host-client'),
            browserHostGeneration: Number(
              getRequiredStringFlag(ctx.flags, 'browser-host-generation')
            ),
            pageHostGeneration: Number(getRequiredStringFlag(ctx.flags, 'page-host-generation'))
          }
        : undefined,
      requestId: getRequiredStringFlag(ctx.flags, 'request'),
      page: getRequiredStringFlag(ctx.flags, 'page'),
      worktreeId: getRequiredStringFlag(ctx.flags, 'worktree'),
      relyingPartyId: getRequiredStringFlag(ctx.flags, 'relying-party'),
      environmentId:
        typeof ctx.flags.get('runtime-environment') === 'string'
          ? ctx.flags.get('runtime-environment')
          : null,
      credentialId
    })
    if (!target.success) {
      throw new RuntimeClientError('invalid_argument', 'Invalid dialog target.')
    }
    if ((target.data.environmentId !== null) !== Boolean(target.data.clientTarget)) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Client-hosted dialogs require the exact materialized client target.'
      )
    }
    let response
    try {
      response = await ctx.client.call<{ applied: boolean; webAuthnDialog?: unknown }>(
        'ui.browserViewer',
        {
          viewer: 'host',
          operation: 'webauthn-dialog',
          command: target.data
        }
      )
    } catch (error) {
      if (
        error instanceof RuntimeRpcFailureError &&
        ['method_not_found', 'unknown_method', 'invalid_params'].includes(error.code)
      ) {
        throw new RuntimeClientError(
          'incompatible_runtime',
          'This runtime does not support mounted WebAuthn dialog receipts.'
        )
      }
      throw error
    }
    const receipt = BrowserWebAuthnDialogState.safeParse(response.result.webAuthnDialog)
    const { credentialId: selected, ...identity } = target.data
    const expected = {
      ...identity,
      action: selected === null ? 'cancel' : 'select',
      accepted: true,
      removed: true
    }
    if (
      !response.result.applied ||
      !receipt.success ||
      JSON.stringify(receipt.data) !== JSON.stringify(expected)
    ) {
      throw new RuntimeClientError(
        'runtime_error',
        'WebAuthn dialog did not return the exact owner receipt.'
      )
    }
    printResult(response, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
