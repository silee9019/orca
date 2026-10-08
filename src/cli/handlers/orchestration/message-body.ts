import { resolve } from 'node:path'
import { readNodeFileWithinLimit } from '../../../shared/node-bounded-file-reader'
import { readNodeReadableTextWithinLimit } from '../../../shared/node-readable-text'
import { getOptionalStringFlag, getRequiredStringFlag } from '../../flags'
import { RuntimeClientError } from '../../runtime-client'

export async function readOrchestrationMessageBody(
  flags: Map<string, string | boolean>,
  cwd: string,
  required = false
): Promise<string | undefined> {
  const file = getOptionalStringFlag(flags, 'body-file')
  if (file === undefined) {
    return required ? getRequiredStringFlag(flags, 'body') : getOptionalStringFlag(flags, 'body')
  }
  if (flags.has('body')) {
    throw new RuntimeClientError('invalid_argument', 'Use only one of --body and --body-file.')
  }
  try {
    if (file === '-') {
      if (process.stdin.isTTY) {
        throw new Error('stdin is a terminal')
      }
      return await readNodeReadableTextWithinLimit(process.stdin, 1024 * 1024)
    }
    const result = await readNodeFileWithinLimit(resolve(cwd, file), 1024 * 1024, {
      regularFileOnly: true
    })
    return new TextDecoder('utf-8', { fatal: true }).decode(result.buffer)
  } catch {
    throw new RuntimeClientError(
      'invalid_argument',
      'Cannot read message body; use a regular UTF-8 file or piped stdin, up to 1 MiB.'
    )
  }
}
