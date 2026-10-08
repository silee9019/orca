import type { z } from 'zod'
import { createReadStream } from 'node:fs'
import { getOptionalStringFlag } from '../flags'
import { RuntimeClientError } from '../runtime-client'

export async function readConnectionInput(flags: Map<string, string | boolean>): Promise<string> {
  const file = getOptionalStringFlag(flags, 'input-file')
  if (Boolean(file) === flags.has('input-stdin')) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Choose exactly one of --input-file or --input-stdin'
    )
  }
  if (!file && process.stdin.isTTY) {
    throw new RuntimeClientError('invalid_argument', 'Connection input requires piped stdin')
  }
  const input = file ? createReadStream(file) : process.stdin
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of input) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
    size += bytes.length
    if (size > 65536) {
      throw new RuntimeClientError('invalid_argument', 'Connection input exceeds 64 KiB')
    }
    chunks.push(bytes)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export async function readConnectionJson(flags: Map<string, string | boolean>): Promise<unknown> {
  const text = await readConnectionInput(flags)
  try {
    return JSON.parse(text)
  } catch {
    throw new RuntimeClientError('invalid_argument', 'Connection input must be valid JSON')
  }
}

export function parseConnectionInput<T>(
  schema: z.ZodType<T>,
  value: unknown,
  message = 'Invalid connection input'
): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw new RuntimeClientError('invalid_argument', message)
  }
  return parsed.data
}
