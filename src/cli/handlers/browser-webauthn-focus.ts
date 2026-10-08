import { z } from 'zod'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError, RuntimeRpcFailureError } from '../runtime-client'
import { readBrowserWebAuthnCredentialFile } from '../browser-webauthn-credential-file'
import {
  BrowserWebAuthnFocusTarget,
  BrowserWebAuthnFocusState
} from '../../shared/rpc-contract/browser-webauthn-focus-params'
const Receipt = z.object({ applied: z.literal(true), webAuthnFocus: BrowserWebAuthnFocusState })
export const BROWSER_WEBAUTHN_FOCUS_HANDLERS: Record<string, CommandHandler> = {
  'browser webauthn dialog-focus': async (ctx) => {
    if (ctx.client.isRemote || getRequiredStringFlag(ctx.flags, 'viewer') !== 'host') {
      throw new RuntimeClientError('invalid_argument', 'Require the local host dialog viewer.')
    }
    const target = BrowserWebAuthnFocusTarget.safeParse({
      requestId: getRequiredStringFlag(ctx.flags, 'request'),
      page: getRequiredStringFlag(ctx.flags, 'page'),
      worktreeId: getRequiredStringFlag(ctx.flags, 'worktree'),
      relyingPartyId: getRequiredStringFlag(ctx.flags, 'relying-party'),
      environmentId: ctx.flags.has('runtime-environment')
        ? getRequiredStringFlag(ctx.flags, 'runtime-environment')
        : null,
      accountId: await readBrowserWebAuthnCredentialFile(
        getRequiredStringFlag(ctx.flags, 'credential-file')
      ),
      clientTarget: ctx.flags.has('remote-page')
        ? {
            remotePageId: getRequiredStringFlag(ctx.flags, 'remote-page'),
            browserHostClientId: getRequiredStringFlag(ctx.flags, 'browser-host-client'),
            browserHostGeneration: Number(
              getRequiredStringFlag(ctx.flags, 'browser-host-generation')
            ),
            pageHostGeneration: Number(getRequiredStringFlag(ctx.flags, 'page-host-generation'))
          }
        : undefined
    })
    if (
      !target.success ||
      (target.data.environmentId !== null) !== Boolean(target.data.clientTarget)
    ) {
      throw new RuntimeClientError('invalid_argument', 'Invalid exact dialog focus target.')
    }
    let response
    try {
      response = await ctx.client.call<unknown>('ui.browserViewer', {
        viewer: 'host',
        operation: 'webauthn-dialog-focus',
        command: target.data
      })
    } catch (error) {
      if (
        error instanceof RuntimeRpcFailureError &&
        ['method_not_found', 'unknown_method', 'invalid_params'].includes(error.code)
      ) {
        throw new RuntimeClientError(
          'incompatible_runtime',
          'This runtime does not support mounted WebAuthn focus receipts.'
        )
      }
      throw error
    }
    const receipt = Receipt.safeParse(response.result)
    const { accountId: _, ...identity } = target.data
    if (
      !receipt.success ||
      JSON.stringify(receipt.data.webAuthnFocus) !==
        JSON.stringify({ ...identity, focused: true, accountIndex: 0 })
    ) {
      throw new RuntimeClientError(
        'runtime_error',
        'The exact first account DOM focus was not acknowledged.'
      )
    }
    printResult(
      {
        id: response.id,
        ok: true,
        _meta: { runtimeId: response._meta.runtimeId },
        result: receipt.data
      },
      ctx.json,
      (value) => JSON.stringify(value, null, 2)
    )
  }
}
