import { z } from 'zod'
import { readArtifactFileWithinLimit } from '../../shared/artifact-file-read'
import type { CommandHandler } from '../dispatch'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'

const formatSpeech = (value: unknown): string => JSON.stringify(value, null, 2)

export const SPEECH_HANDLERS: Record<string, CommandHandler> = {
  'speech models list': async ({ client, json }) => {
    printResult(await client.call('speech.models.list'), json, formatSpeech)
  },
  'speech models download': async ({ client, flags, json }) => {
    printResult(
      await client.call('speech.models.download', {
        modelId: getRequiredStringFlag(flags, 'model')
      }),
      json,
      formatSpeech
    )
  },
  'speech models rm': async ({ client, flags, json }) => {
    const model = getRequiredStringFlag(flags, 'model')
    if (getRequiredStringFlag(flags, 'confirm') !== model) {
      throw new RuntimeClientError('invalid_argument', '--confirm must match the model ID')
    }
    printResult(
      await client.call('speech.models.delete', { modelId: getRequiredStringFlag(flags, 'model') }),
      json,
      formatSpeech
    )
  },
  'speech models cancel': async ({ client, flags, json }) => {
    printResult(
      await client.call('speech.models.cancel', { modelId: getRequiredStringFlag(flags, 'model') }),
      json,
      formatSpeech
    )
  },
  'speech setup': async ({ client, flags, json }) => {
    const mode = getOptionalStringFlag(flags, 'mode')
    const enabled = getOptionalStringFlag(flags, 'enabled')
    if (mode !== undefined && mode !== 'hold' && mode !== 'toggle') {
      throw new RuntimeClientError('invalid_argument', '--mode must be hold or toggle')
    }
    if (enabled !== undefined && enabled !== 'true' && enabled !== 'false') {
      throw new RuntimeClientError('invalid_argument', '--enabled must be true or false')
    }
    const modelId = getOptionalStringFlag(flags, 'model')
    printResult(
      await client.call('speech.dictation.setup', {
        ...(mode !== undefined ? { dictationMode: mode } : {}),
        ...(enabled !== undefined ? { enabled: enabled === 'true' } : {}),
        ...(modelId !== undefined ? { modelId } : {})
      }),
      json,
      formatSpeech
    )
  },
  'speech key status': async ({ client, json }) => {
    printResult(await client.call('speech.key.status'), json, formatSpeech)
  },
  'speech key clear': async ({ client, json }) => {
    printResult(await client.call('speech.key.clear'), json, formatSpeech)
  },
  'speech key save': async ({ client, flags, json }) => {
    const path = getRequiredStringFlag(flags, 'input-file')
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
    const response = await client.call('speech.key.save', { apiKey })
    // A peer response must never echo the submitted credential into terminal output.
    const status = z
      .object({
        configured: z.literal(true),
        protection: z.enum(['sealed', 'plaintext']).nullable().optional()
      })
      .safeParse(response.result)
    if (!status.success) {
      throw new RuntimeClientError(
        'speech_key_save_failed',
        'The host did not confirm that the speech key was saved'
      )
    }
    printResult({ ...response, result: status.data }, json, formatSpeech)
  }
}
