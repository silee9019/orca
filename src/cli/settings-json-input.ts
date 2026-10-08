import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { RuntimeClientError } from './runtime-client'

const MAX_SETTINGS_INPUT_BYTES = 1024 * 1024

export async function readSettingsJsonInput(file: string, cwd: string): Promise<unknown> {
  let input: string
  if (file === '-') {
    if (process.stdin.isTTY) {
      throw new RuntimeClientError('invalid_argument', 'Pipe settings JSON to stdin or use --file.')
    }
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of process.stdin) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += bytes.length
      checkInputSize(size)
      chunks.push(bytes)
    }
    input = Buffer.concat(chunks).toString('utf8')
  } else {
    const path = resolve(cwd, file)
    const info = await stat(path)
    if (!info.isFile()) {
      throw new RuntimeClientError('invalid_argument', '--file must name a regular JSON file.')
    }
    checkInputSize(info.size)
    input = await readFile(path, 'utf8')
    checkInputSize(Buffer.byteLength(input))
  }
  try {
    return JSON.parse(input)
  } catch {
    throw new RuntimeClientError('invalid_argument', 'Invalid settings JSON.')
  }
}

function checkInputSize(size: number): void {
  if (size > MAX_SETTINGS_INPUT_BYTES) {
    throw new RuntimeClientError('invalid_argument', 'Settings JSON must be at most 1 MiB.')
  }
}
