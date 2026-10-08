import { z } from 'zod'
import { readSpeechKeyInput } from '../speech-key-input'
import type { CommandHandler } from '../dispatch'
import { VoiceViewerParams, VoiceViewerResultSchema } from '../../shared/voice-viewer'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { RuntimeClientError } from '../runtime-client'
import { printResult } from '../format'

const publicModelMenuReply = z.object({
  id: z.string(),
  ok: z.literal(true),
  _meta: z.object({ runtimeId: z.string() }),
  result: VoiceViewerResultSchema
})
export const VOICE_VIEWER_HANDLERS: Record<string, CommandHandler> = {
  'speech viewer': async ({ client, flags, json }) => {
    const operation = getRequiredStringFlag(flags, 'operation')
    const apiKey =
      operation === 'key-draft'
        ? await readSpeechKeyInput(getRequiredStringFlag(flags, 'input-file'))
        : undefined
    const command = VoiceViewerParams.parse({
      viewer: getRequiredStringFlag(flags, 'viewer'),
      operation,
      apiKey,
      modelId: getOptionalStringFlag(flags, 'model'),
      confirmation: getOptionalStringFlag(flags, 'confirm'),
      deviceId: getOptionalStringFlag(flags, 'device') ?? '',
      operationId: getOptionalStringFlag(flags, 'operation-id'),
      repoId: getOptionalStringFlag(flags, 'repo'),
      recipeId: getOptionalStringFlag(flags, 'recipe'),
      runtimeId: getOptionalStringFlag(flags, 'runtime')
    })
    const response = await client.call('voice.viewer', command)
    if (['model-menu-open', 'model-menu-close', 'model-menu-status'].includes(command.operation)) {
      const reply = publicModelMenuReply.safeParse(response)
      if (
        !reply.success ||
        !reply.data.result.applied ||
        typeof reply.data.result.modelMenuOpen !== 'boolean' ||
        (command.operation !== 'model-menu-status' &&
          reply.data.result.modelMenuOpen !== (command.operation === 'model-menu-open'))
      ) {
        throw new RuntimeClientError(
          'runtime_error',
          'The viewer did not confirm the model menu state.'
        )
      }
      printResult(reply.data, json, (value) => JSON.stringify(value, null, 2))
      return
    }
    const result = VoiceViewerResultSchema.parse(response.result)
    if (!result.applied) {
      throw new RuntimeClientError(
        'voice_viewer_not_applied',
        result.reason ?? 'The host viewer did not apply the requested action'
      )
    }
    if (
      ['microphone-select', 'tip-close', 'tip-skip', 'tip-enable', 'tip-settings-open'].includes(
        command.operation
      ) &&
      !result.persisted
    ) {
      throw new RuntimeClientError(
        'voice_viewer_persistence_unknown',
        'The host viewer did not confirm persistence'
      )
    }
    printResult({ ...response, result }, json, (value) => JSON.stringify(value, null, 2))
  }
}
