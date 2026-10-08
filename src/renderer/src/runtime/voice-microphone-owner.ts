import type { VoiceMicrophoneDevice } from '@/components/dictation/microphone-devices'
import { startMicrophoneRequest, cancelMicrophoneRequest } from './voice-microphone-requests'
export type VoiceMicrophoneOwner = {
  refresh: () => Promise<VoiceMicrophoneDevice[] | null>
  select: (deviceId: string | null) => Promise<{ deviceId: string | null; label: string | null }>
  access: (isCancelled: () => boolean) => Promise<boolean>
}
let owner: { receiver: VoiceMicrophoneOwner; operationId?: string } | null = null
export function attachVoiceMicrophoneOwner(receiver: VoiceMicrophoneOwner): () => void {
  const binding: { receiver: VoiceMicrophoneOwner; operationId?: string } = { receiver }
  owner = binding
  return () => {
    if (owner === binding) {
      if (binding.operationId) {
        cancelMicrophoneRequest(binding.operationId)
      }
      owner = null
    }
  }
}
function requireOwner(): NonNullable<typeof owner> {
  if (!owner) {
    throw new Error('voice_microphone_owner_unavailable')
  }
  return owner
}
export async function refreshVoiceMicrophoneOwner(): Promise<VoiceMicrophoneDevice[]> {
  const devices = await requireOwner().receiver.refresh()
  if (!devices) {
    throw new Error('voice_microphone_refresh_unavailable')
  }
  return devices
}
export function selectVoiceMicrophoneOwner(deviceId: string | null) {
  return requireOwner().receiver.select(deviceId)
}
export function startVoiceMicrophoneOwner() {
  const current = requireOwner()
  const operation = startMicrophoneRequest(current.receiver.access)
  current.operationId = operation.operationId
  return operation
}
