import { createReadStream } from 'node:fs'
import { MAX_SPEECH_FILE_BYTES } from '../../shared/speech-file-input'
import { DICTATION_SAMPLE_RATE } from '../../shared/rpc-contract/speech-params'
import type { CommandHandler } from '../dispatch'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'

export const SPEECH_TRANSCRIPTION_HANDLERS: Record<string, CommandHandler> = {
  'speech dictation transcribe': async ({ client, flags, json }) => {
    const path = getRequiredStringFlag(flags, 'audio-file')
    if (path === '-' && process.stdin.isTTY) {
      throw new RuntimeClientError('invalid_argument', 'PCM audio requires piped stdin')
    }
    const input = path === '-' ? process.stdin : createReadStream(path)
    const chunks: Buffer[] = []
    let bytes = 0
    for await (const chunk of input) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
      bytes += buffer.length
      if (bytes > MAX_SPEECH_FILE_BYTES) {
        throw new RuntimeClientError('invalid_argument', 'PCM audio exceeds the 5 MiB input limit')
      }
      chunks.push(buffer)
    }
    if (!bytes || bytes % 2 !== 0) {
      throw new RuntimeClientError('invalid_argument', 'Audio must contain complete PCM16 samples')
    }
    const result = await client.call<{ dictationId: string; text: string }>(
      'speech.dictation.transcribe',
      {
        modelId: getOptionalStringFlag(flags, 'model'),
        sampleRate: DICTATION_SAMPLE_RATE,
        audioBase64: Buffer.concat(chunks).toString('base64')
      }
    )
    printResult(result, json, (value) => value.text)
  }
}
