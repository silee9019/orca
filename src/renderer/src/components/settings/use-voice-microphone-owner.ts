import { useEffect, useRef } from 'react'
import {
  attachVoiceMicrophoneOwner,
  type VoiceMicrophoneOwner
} from '@/runtime/voice-microphone-owner'
export function useVoiceMicrophoneOwner(owner: VoiceMicrophoneOwner): void {
  const latest = useRef(owner)
  useEffect(() => {
    latest.current = owner
  }, [owner])
  useEffect(
    () =>
      attachVoiceMicrophoneOwner({
        refresh: () => latest.current.refresh(),
        select: (id) => latest.current.select(id),
        access: (isCancelled) => latest.current.access(isCancelled)
      }),
    []
  )
}
