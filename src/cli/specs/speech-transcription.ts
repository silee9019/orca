import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const SPEECH_TRANSCRIPTION_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['speech', 'dictation', 'transcribe'],
    summary: 'Transcribe a mono PCM16 audio file through the selected host speech service',
    usage: 'orca speech dictation transcribe --audio-file <path|-> [--model <id>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'audio-file', 'model'],
    notes: [
      'Input is raw signed little-endian PCM16, mono, 16000 Hz, at most 5 MiB. Use - for piped stdin.',
      'Dictation must be enabled and its model ready on the execution host. No microphone or desktop focus is requested.'
    ]
  }
]
