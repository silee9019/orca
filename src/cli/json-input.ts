import { createReadStream } from 'node:fs'
import { getOptionalStringFlag } from './flags'
import { RuntimeClientError } from './runtime-client'
import type { HandlerContext } from './dispatch'

export async function readJsonInput(ctx: HandlerContext): Promise<unknown> {
  if (ctx.flags.has('input-stdin') && ctx.flags.get('input-stdin') !== true) {
    throw new RuntimeClientError('invalid_argument', '--input-stdin does not take a value')
  }
  const file = getOptionalStringFlag(ctx.flags, 'input-file')
  if (file && ctx.flags.has('input-stdin')) {
    throw new RuntimeClientError('invalid_argument', 'Choose --input-file or --input-stdin')
  }
  if (!file && !ctx.flags.has('input-stdin')) {
    return undefined
  }
  if (!file && process.stdin.isTTY) {
    throw new RuntimeClientError('invalid_argument', 'Pipe JSON to stdin')
  }
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of file ? createReadStream(file) : process.stdin) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += bytes.length
    if (size > 65536) {
      throw new RuntimeClientError('invalid_argument', 'Input exceeds 64 KiB')
    }
    chunks.push(bytes)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  try {
    return JSON.parse(text)
  } catch {
    throw new RuntimeClientError('invalid_argument', 'Input must be valid JSON')
  }
}
