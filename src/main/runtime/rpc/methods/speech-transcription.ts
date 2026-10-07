import type { SttEvent } from '../../../speech/stt-service'
import { randomUUID } from 'node:crypto'
import { SpeechFileTranscription } from '../../../../shared/rpc-contract/voice-control-params'
import { defineMethod } from '../core'
import { MAX_DICTATION_AUDIO_CHUNK_BYTES } from '../../../../shared/rpc-contract/speech-params'

export const SPEECH_TRANSCRIPTION_METHODS = [
  defineMethod({
    name: 'speech.dictation.transcribe',
    params: SpeechFileTranscription,
    handler: async (params, { runtime, connectionId, signal }) => {
      signal?.throwIfAborted()
      const dictationId = randomUUID()
      const identity = { dictationId, clientId: `cli:${dictationId}`, connectionId }
      const abort = (): void => {
        void runtime.cancelMobileDictation(identity).catch(() => {})
      }
      signal?.addEventListener('abort', abort, { once: true })
      let finished = false
      const events: SttEvent[] = []
      let eventsTruncated = false
      try {
        await runtime.startMobileDictation({
          ...identity,
          modelId: params.modelId,
          onEvent: (event) => {
            if (events.length >= 256) {
              eventsTruncated = true
              return
            }
            if (
              (event.type === 'partial' || event.type === 'final') &&
              (event.text?.length ?? 0) > 4096
            ) {
              eventsTruncated = true
            }
            events.push(
              event.type === 'partial' || event.type === 'final'
                ? { type: event.type, text: event.text?.slice(0, 4096) }
                : event.type === 'error'
                  ? { type: 'error', error: 'speech_engine_failed' }
                  : event
            )
          }
        })
        signal?.throwIfAborted()
        const audio = Buffer.from(params.audioBase64, 'base64')
        for (let offset = 0; offset < audio.length; offset += MAX_DICTATION_AUDIO_CHUNK_BYTES) {
          runtime.feedMobileDictation({
            ...identity,
            audioBase64: audio
              .subarray(offset, offset + MAX_DICTATION_AUDIO_CHUNK_BYTES)
              .toString('base64'),
            sampleRate: params.sampleRate
          })
        }
        const result = await runtime.finishMobileDictation(identity)
        signal?.throwIfAborted()
        finished = true
        return { ...result, events, eventsTruncated }
      } catch (error) {
        throw new Error(
          error instanceof Error && /^[a-z][a-z0-9_]*$/.test(error.message)
            ? error.message
            : 'speech_transcription_failed'
        )
      } finally {
        signal?.removeEventListener('abort', abort)
        if (!finished) {
          await runtime.cancelMobileDictation(identity).catch(() => {})
        }
      }
    }
  })
]
