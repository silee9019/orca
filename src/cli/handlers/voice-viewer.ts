import { readSpeechKeyInput } from '../speech-key-input'
import type { CommandHandler } from '../dispatch'
import { VoiceViewerParams, VoiceViewerResultSchema } from '../../shared/voice-viewer'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { RuntimeClientError } from '../runtime-client'
import { printResult } from '../format'

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
