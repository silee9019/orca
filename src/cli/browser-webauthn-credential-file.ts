import { readFile, stat } from 'node:fs/promises'
import { RuntimeClientError } from './runtime-client'
export async function readBrowserWebAuthnCredentialFile(file: string): Promise<string> {
  try {
    if ((await stat(file)).size > 4096) {
      throw new Error('too large')
    }
    return (await readFile(file, 'utf8')).trim()
  } catch {
    throw new RuntimeClientError(
      'invalid_argument',
      'Could not read credential file (maximum 4096 bytes).'
    )
  }
}
