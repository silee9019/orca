import { requireAccountsPermissionsExecutionHost } from '../accounts-permissions-host-boundary'
import { openSync, closeSync, readSync } from 'node:fs'
import { resolve } from 'node:path'
import type { CommandHandler, HandlerContext } from '../dispatch'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'
import { rejectRemoteSelectionFlags } from '../remote-selection-flag-rejection'
import { AccountCredentialProvider } from '../../shared/rpc-contract/account-credentials-params'

export function readCredentialInput(path: string | number): string {
  const fd = typeof path === 'number' ? path : openSync(path, 'r')
  try {
    const buffer = Buffer.alloc(65537)
    let size = 0
    while (size < buffer.length) {
      const count = readSync(fd, buffer, size, buffer.length - size, null)
      if (count === 0) {
        break
      }
      size += count
    }
    if (size > 65536) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Credential input must contain at most 65536 bytes.'
      )
    }
    return buffer.subarray(0, size).toString('utf8').trim()
  } finally {
    if (typeof path === 'string') {
      closeSync(fd)
    }
  }
}

async function runCredentialCommand(
  ctx: HandlerContext,
  action: 'status' | 'save' | 'clear'
): Promise<void> {
  requireAccountsPermissionsExecutionHost(ctx)
  rejectRemoteSelectionFlags(
    ctx.flags,
    '`orca credentials`. Run it on the host whose credentials you want to manage.'
  )
  const provider = AccountCredentialProvider.safeParse(ctx.flags.get('provider'))
  if (!provider.success) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Use --provider minimax-cookie|minimax-api-key|opencode-go|zcode-plan|bitbucket.'
    )
  }
  let secret: string | undefined
  if (action === 'save') {
    const input = ctx.flags.get('input-file')
    if (typeof input !== 'string' || !input) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Use --input-file <path|->; credential values cannot be passed as arguments.'
      )
    }
    if (input === '-' && process.stdin.isTTY) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Pipe the credential to stdin or provide an input file.'
      )
    }
    try {
      secret = readCredentialInput(input === '-' ? 0 : resolve(ctx.cwd, input))
    } catch (error) {
      if (error instanceof RuntimeClientError) {
        throw error
      }
      throw new RuntimeClientError('invalid_argument', 'Could not read the credential input file.')
    }
    if (!secret || Buffer.byteLength(secret) > 65536) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Credential input must contain 1–65536 bytes.'
      )
    }
  }
  const result = await ctx.client.call(`accountCredentials.${action}`, {
    provider: provider.data,
    ...(secret === undefined ? {} : { secret })
  })
  printResult(result, ctx.json, (status) => JSON.stringify(status, null, 2))
}

export const ACCOUNT_CREDENTIAL_HANDLERS: Record<string, CommandHandler> = {
  'credentials status': (ctx) => runCredentialCommand(ctx, 'status'),
  'credentials save': (ctx) => runCredentialCommand(ctx, 'save'),
  'credentials clear': (ctx) => runCredentialCommand(ctx, 'clear')
}
