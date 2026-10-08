import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { ZodType } from 'zod'
import type { HandlerContext } from './dispatch'
import { getRequiredStringFlag } from './flags'
import { RuntimeClientError } from './runtime-client'

const MAX_INPUT_BYTES = 8 * 1024 * 1024

export async function readWorkspaceCommandInput<T>(
  ctx: HandlerContext,
  schema: ZodType<T>
): Promise<T> {
  const source = getRequiredStringFlag(ctx.flags, 'params-file')
  let bytes: Buffer
  if (source === '-') {
    if (process.stdin.isTTY) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Pipe JSON to stdin or use --params-file <file>.'
      )
    }
    const chunks: Buffer[] = []
    let length = 0
    for await (const chunk of process.stdin) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
      length += buffer.length
      if (length > MAX_INPUT_BYTES) {
        throw new RuntimeClientError('invalid_argument', 'Input exceeds 8 MiB.')
      }
      chunks.push(buffer)
    }
    bytes = Buffer.concat(chunks)
  } else {
    const file = await open(resolve(ctx.cwd, source), constants.O_RDONLY | constants.O_NONBLOCK)
    try {
      if (!(await file.stat()).isFile()) {
        throw new RuntimeClientError('invalid_argument', 'Input must be a regular JSON file.')
      }
      bytes = Buffer.alloc(MAX_INPUT_BYTES + 1)
      let length = 0
      while (length < bytes.length) {
        const read = await file.read(bytes, length, bytes.length - length, null)
        if (read.bytesRead === 0) {
          break
        }
        length += read.bytesRead
      }
      if (length > MAX_INPUT_BYTES) {
        throw new RuntimeClientError('invalid_argument', 'Input exceeds 8 MiB.')
      }
      bytes = bytes.subarray(0, length)
    } finally {
      await file.close()
    }
  }
  let input: unknown
  try {
    input = JSON.parse(bytes.toString('utf8'))
  } catch {
    throw new RuntimeClientError('invalid_argument', 'Input must contain valid JSON.')
  }
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    throw new RuntimeClientError('invalid_argument', 'Invalid input for this command.', {
      fields: parsed.error.issues.map((issue) => issue.path.join('.'))
    })
  }
  return parsed.data
}

export function confirmWorkspaceCommand(ctx: HandlerContext, target: string): void {
  if (getRequiredStringFlag(ctx.flags, 'confirm') !== target) {
    throw new RuntimeClientError(
      'invalid_argument',
      '--confirm must exactly match the input target.'
    )
  }
}
