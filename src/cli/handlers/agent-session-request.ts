import { resolve } from 'node:path'
import type { z } from 'zod'
import { readNodeFileWithinLimit } from '../../shared/node-bounded-file-reader'
import { readNodeReadableTextWithinLimit } from '../../shared/node-readable-text'
import type { HandlerContext } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { RuntimeClientError } from '../runtime/types'

const MAX_REQUEST_BYTES = 1024 * 1024

export async function readAgentSessionRequest<T>(
  ctx: HandlerContext,
  schema: z.ZodType<T>
): Promise<T> {
  const path = getRequiredStringFlag(ctx.flags, 'request-file')
  let text: string
  try {
    if (path === '-') {
      if (process.stdin.isTTY) {
        throw new Error('stdin is a terminal')
      }
      text = await readNodeReadableTextWithinLimit(process.stdin, MAX_REQUEST_BYTES, {
        fatalUtf8: true
      })
    } else {
      const result = await readNodeFileWithinLimit(resolve(ctx.cwd, path), MAX_REQUEST_BYTES, {
        regularFileOnly: true
      })
      text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(result.buffer)
    }
  } catch {
    throw new RuntimeClientError(
      'invalid_argument',
      'Cannot read agent session request; use a regular UTF-8 file or piped stdin, up to 1 MiB.'
    )
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new RuntimeClientError('invalid_argument', 'Invalid agent session request JSON.')
  }
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Invalid agent session request; use the documented RPC request shape.'
    )
  }
  return parsed.data
}
