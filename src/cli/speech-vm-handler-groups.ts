import type { HandlerGroup } from './handler-group-manifest'

export const SPEECH_VM_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'voice-viewer',
    keys: ['speech viewer'],
    load: async () => (await import('./handlers/voice-viewer.js')).VOICE_VIEWER_HANDLERS
  },
  {
    name: 'speech',
    keys: [
      'speech models list',
      'speech models download',
      'speech models cancel',
      'speech models rm',
      'speech setup',
      'speech key status',
      'speech key save',
      'speech key clear'
    ],
    load: async () => (await import('./handlers/speech.js')).SPEECH_HANDLERS
  },
  {
    name: 'speech-transcription',
    keys: ['speech dictation transcribe'],
    load: async () =>
      (await import('./handlers/speech-transcription.js')).SPEECH_TRANSCRIPTION_HANDLERS
  },
  {
    name: 'vm-lifecycle',
    keys: [
      'vm recipes',
      'vm catalog',
      'vm doctor',
      'vm provision',
      'vm provision-status',
      'vm cancel',
      'vm runtimes',
      'vm attach',
      'vm cleanup',
      'vm stop-cleanup',
      'vm suspend',
      'vm resume',
      'vm cleanup-command'
    ],
    load: async () => (await import('./handlers/vm-lifecycle.js')).VM_LIFECYCLE_HANDLERS
  }
]
