import { useEffect, type RefObject } from 'react'
import type { DictationState } from '../../../../shared/speech-types'
import { DICTATION_CONTROL_EVENT } from './dictation-control-events'

type Options = {
  enabled: boolean
  dictationStateRef: RefObject<DictationState>
  startDictation: () => Promise<void>
  stopDictation: () => Promise<void>
}
export function useDictationDocumentControl({
  enabled,
  dictationStateRef,
  startDictation,
  stopDictation
}: Options): void {
  useEffect(() => {
    const handleControl = (event: Event): void => {
      if (!enabled || dictationStateRef.current === 'stopping' || !(event instanceof CustomEvent)) {
        return
      }
      const action: unknown = event.detail
      if (action === 'start') {
        if (dictationStateRef.current === 'idle') {
          void startDictation()
        }
        return
      }
      if (action === 'stop') {
        if (dictationStateRef.current === 'listening' || dictationStateRef.current === 'starting') {
          void stopDictation()
        }
        return
      }
      if (action !== 'toggle') {
        return
      }
      if (dictationStateRef.current === 'listening' || dictationStateRef.current === 'starting') {
        void stopDictation()
      } else {
        void startDictation()
      }
    }
    document.addEventListener(DICTATION_CONTROL_EVENT, handleControl)
    return () => document.removeEventListener(DICTATION_CONTROL_EVENT, handleControl)
  }, [enabled, dictationStateRef, startDictation, stopDictation])
}
