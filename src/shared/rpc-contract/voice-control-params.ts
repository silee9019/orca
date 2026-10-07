import { z } from 'zod'
import { MAX_SPEECH_FILE_BYTES } from '../speech-file-input'
import { DICTATION_SAMPLE_RATE, isValidAudioBase64 } from './speech-params'

export const SpeechKeySave = z.object({ apiKey: z.string().trim().min(1).max(8192) })
export const SpeechFileTranscription = z.object({
  modelId: z.string().trim().min(1).optional(),
  audioBase64: z
    .string()
    .min(1)
    .max(Math.ceil(MAX_SPEECH_FILE_BYTES / 3) * 4)
    .refine(isValidAudioBase64, 'Audio must be base64')
    .refine((value) => {
      const bytes =
        Math.floor((value.length * 3) / 4) -
        (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0)
      return bytes > 0 && bytes <= MAX_SPEECH_FILE_BYTES && bytes % 2 === 0
    }, 'Audio must contain complete PCM16 samples'),
  sampleRate: z.literal(DICTATION_SAMPLE_RATE)
})
