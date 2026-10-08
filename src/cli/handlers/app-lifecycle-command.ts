import { writeFile } from 'node:fs/promises'
import { readNodeFileWithinLimit } from '../../shared/node-bounded-file-reader'
import { resolve } from 'node:path'
import type { HandlerContext } from '../dispatch'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'

export function stringFlag(flags: HandlerContext['flags'], name: string): string | undefined {
  const value = flags.get(name)
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== 'string' || !value.trim()) {
    throw new RuntimeClientError('invalid_argument', `Missing value for --${name}`)
  }
  return value
}

export function confirmTarget(flags: HandlerContext['flags']): string {
  const value = stringFlag(flags, 'confirm-target')
  if (!value) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Read app status and pass its exact --confirm-target before changing this app.'
    )
  }
  return value
}

export function viewer(flags: HandlerContext['flags']): number {
  const value = Number(stringFlag(flags, 'viewer'))
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RuntimeClientError('invalid_argument', 'Pass an explicit --viewer from app status')
  }
  return value
}

export async function printCall(
  context: HandlerContext,
  method: string,
  params?: unknown
): Promise<void> {
  const result =
    params === undefined
      ? await context.client.call(method)
      : await context.client.call(method, params)
  printResult(result, context.json, (value) => JSON.stringify(value, null, 2))
}

export async function readAppInput(context: HandlerContext): Promise<unknown> {
  const file = stringFlag(context.flags, 'input-file')
  if (!file) {
    throw new RuntimeClientError('invalid_argument', 'Pass JSON through --input-file')
  }
  const { buffer } = await readNodeFileWithinLimit(resolve(context.cwd, file), 65536, {
    regularFileOnly: true
  })
  try {
    return JSON.parse(buffer.toString('utf8'))
  } catch {
    throw new RuntimeClientError('invalid_argument', 'Input must be valid JSON')
  }
}

export function requiredFlag(flags: HandlerContext['flags'], name: string): string {
  const value = stringFlag(flags, name)
  if (!value) {
    throw new RuntimeClientError('invalid_argument', `Missing required --${name}`)
  }
  return value
}

export async function savePrivateAppResult(
  context: HandlerContext,
  method: string,
  params: unknown
): Promise<void> {
  const file = resolve(context.cwd, requiredFlag(context.flags, 'output-file'))
  const response = await context.client.call(method, params)
  await writeFile(file, `${JSON.stringify(response.result, null, 2)}\n`, {
    mode: 0o600,
    flag: 'wx'
  })
  printResult({ ...response, result: { saved: true, path: file } }, context.json, (value) =>
    JSON.stringify(value)
  )
}
