import { useEffect, useCallback } from 'react'
import {
  attachVoiceDictationRequest,
  type VoiceDictationSnapshot
} from '@/runtime/voice-dictation-request'
import type { DictationState } from '../../../../shared/speech-types'
import { captureInsertionTarget, type DictationInsertionTarget } from './dictation-insertion-target'

type Options = {
  enabled: boolean
  dictationStateRef: { current: DictationState }
  lastSessionIdRef: { current: string | null }
  insertionTargetRef: { current: DictationInsertionTarget | null }
  cancellationRequestedRef: { current: boolean }
  intentionalTargetCancellationRef: { current: boolean }
  discardBufferedAudio: () => void
  start: () => Promise<void>
  stop: () => Promise<void>
}
export function useDictationViewerControl({
  enabled,
  dictationStateRef,
  lastSessionIdRef,
  insertionTargetRef,
  cancellationRequestedRef,
  intentionalTargetCancellationRef,
  discardBufferedAudio,
  start,
  stop
}: Options): void {
  const snapshot = useCallback(
    (): VoiceDictationSnapshot => ({
      operationId: lastSessionIdRef.current ?? undefined,
      dictationState: dictationStateRef.current,
      targetCaptured: insertionTargetRef.current !== null,
      cancellationRequested: cancellationRequestedRef.current,
      osPromptDismissed: false
    }),
    [lastSessionIdRef, dictationStateRef, insertionTargetRef, cancellationRequestedRef]
  )
  const cancel = useCallback(() => {
    if (dictationStateRef.current === 'idle') {
      return
    }
    cancellationRequestedRef.current = true
    intentionalTargetCancellationRef.current = true
    insertionTargetRef.current = null
    discardBufferedAudio()
    void stop()
  }, [
    dictationStateRef,
    cancellationRequestedRef,
    intentionalTargetCancellationRef,
    insertionTargetRef,
    discardBufferedAudio,
    stop
  ])
  useEffect(
    () =>
      attachVoiceDictationRequest((command) => {
        const current = snapshot()
        if (command.action === 'status') {
          if (!current.operationId || command.operationId !== current.operationId) {
            throw new Error('voice_dictation_operation_mismatch')
          }
          return current
        }
        if (command.action === 'stop' || command.action === 'cancel') {
          if (!current.operationId || command.operationId !== current.operationId) {
            throw new Error('voice_dictation_operation_mismatch')
          }
          if (command.action === 'cancel') {
            cancel()
          } else {
            void stop()
          }
          return snapshot()
        }
        if (!enabled) {
          throw new Error('voice_dictation_disabled_or_model_missing')
        }
        if (
          command.action === 'toggle' &&
          (current.dictationState === 'starting' || current.dictationState === 'listening')
        ) {
          void stop()
          return snapshot()
        }
        if (current.dictationState !== 'idle') {
          throw new Error('voice_dictation_busy')
        }
        if (!captureInsertionTarget()) {
          throw new Error('voice_dictation_insertion_target_missing')
        }
        void start()
        return snapshot()
      }),
    [enabled, snapshot, start, stop, cancel]
  )
}
