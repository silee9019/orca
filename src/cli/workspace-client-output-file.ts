import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { HandlerContext } from './dispatch'
import { getRequiredStringFlag } from './flags'
import { RuntimeClientError } from './runtime-client'

export function resolveClientOutputPath(ctx: HandlerContext): string {
  const output = getRequiredStringFlag(ctx.flags, 'output-file')
  if (output === '-') {
    throw new RuntimeClientError('invalid_argument', '--output-file must name a new file.')
  }
  return resolve(ctx.cwd, output)
}

// Why: diagnostic text lands only in a file the caller named, never in stdout or an existing path.
export async function writeNewClientOutputFile(
  outputPath: string,
  text: string,
  label: string
): Promise<void> {
  try {
    await writeFile(outputPath, text, { flag: 'wx', mode: 0o600 })
  } catch {
    throw new RuntimeClientError(
      'output_write_failed',
      `Could not create the ${label} output file.`
    )
  }
}
