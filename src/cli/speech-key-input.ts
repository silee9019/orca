import { readArtifactFileWithinLimit } from '../shared/artifact-file-read'
import { RuntimeClientError } from './runtime-client'

export async function readSpeechKeyInput(path: string): Promise<string> {
  let apiKey: string
  if (path === '-') {
    if (process.stdin.isTTY) {
      throw new RuntimeClientError('invalid_argument', 'API key input requires piped stdin')
    }
    const chunks: Buffer[] = []
    let bytes = 0
    for await (const chunk of process.stdin) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
      bytes += buffer.length
      if (bytes > 8192) {
        throw new RuntimeClientError('invalid_argument', 'API key input is too large')
      }
      chunks.push(buffer)
    }
    apiKey = Buffer.concat(chunks).toString('utf8').trim()
  } else {
    const input = await readArtifactFileWithinLimit(path, 8192)
    if (input.status !== 'ok') {
      throw new RuntimeClientError(
        'invalid_argument',
        'API key input must be a nonempty file of at most 8192 bytes'
      )
    }
    apiKey = input.content.trim()
  }
  if (!apiKey) {
    throw new RuntimeClientError('invalid_argument', 'API key input is empty')
  }
  return apiKey
}
