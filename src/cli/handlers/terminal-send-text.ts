import { resolve } from 'node:path'
import { readNodeFileWithinLimit } from '../../shared/node-bounded-file-reader'
import { readNodeReadableTextWithinLimit } from '../../shared/node-readable-text'
import { TERMINAL_INPUT_MAX_BYTES } from '../../shared/terminal-input'
import { getOptionalStringFlag } from '../flags'
import { RuntimeClientError } from '../runtime-client'

export async function readTerminalSendText(
  flags: Map<string, string | boolean>,
  cwd: string
): Promise<string | undefined> {
  const file = getOptionalStringFlag(flags, 'text-file')
  if (file === undefined) {
    return getOptionalStringFlag(flags, 'text')
  }
  if (flags.has('text')) {
    throw new RuntimeClientError('invalid_argument', 'Use only one of --text and --text-file.')
  }
  try {
    if (file === '-') {
      if (process.stdin.isTTY) {
        throw new Error('stdin is a terminal')
      }
      return await readNodeReadableTextWithinLimit(process.stdin, TERMINAL_INPUT_MAX_BYTES)
    }
    const result = await readNodeFileWithinLimit(resolve(cwd, file), TERMINAL_INPUT_MAX_BYTES, {
      regularFileOnly: true
    })
    return new TextDecoder('utf-8', { fatal: true }).decode(result.buffer)
  } catch {
    throw new RuntimeClientError(
      'invalid_argument',
      'Cannot read terminal input; use a regular UTF-8 file or piped stdin, up to 16 MiB.'
    )
  }
}
