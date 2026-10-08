import type { VoiceViewerOperation, VoiceViewerResult } from '../../../shared/voice-viewer'
import { requestVoiceDictation } from './voice-dictation-request'
type Command = Extract<
  VoiceViewerOperation,
  {
    operation:
      | 'dictation-start'
      | 'dictation-toggle'
      | 'dictation-stop'
      | 'dictation-cancel'
      | 'dictation-status'
  }
>
export function applyVoiceDictationViewerAction(
  command: Command
): Omit<VoiceViewerResult, 'viewerId'> {
  return {
    viewer: 'host',
    applied: true,
    persisted: false,
    ...requestVoiceDictation(
      command.operation === 'dictation-start' || command.operation === 'dictation-toggle'
        ? { action: command.operation === 'dictation-start' ? 'start' : 'toggle' }
        : {
            action:
              command.operation === 'dictation-stop'
                ? 'stop'
                : command.operation === 'dictation-cancel'
                  ? 'cancel'
                  : 'status',
            operationId: 'operationId' in command ? command.operationId : undefined
          }
    )
  }
}
