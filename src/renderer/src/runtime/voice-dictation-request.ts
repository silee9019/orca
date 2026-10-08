export type VoiceDictationControl = {
  action: 'start' | 'toggle' | 'stop' | 'cancel' | 'status'
  operationId?: string
}
export type VoiceDictationSnapshot = {
  operationId?: string
  dictationState: 'idle' | 'starting' | 'listening' | 'stopping' | 'error'
  targetCaptured: boolean
  cancellationRequested: boolean
  osPromptDismissed: false
}
let receive: ((command: VoiceDictationControl) => VoiceDictationSnapshot) | null = null
export function attachVoiceDictationRequest(
  receiver: (command: VoiceDictationControl) => VoiceDictationSnapshot
): () => void {
  receive = receiver
  return () => {
    if (receive === receiver) {
      receive = null
    }
  }
}
export function requestVoiceDictation(command: VoiceDictationControl): VoiceDictationSnapshot {
  if (!receive) {
    throw new Error('voice_dictation_viewer_unavailable')
  }
  return receive(command)
}
