import { createNonSecureContextUuid } from '../../../shared/non-secure-context-uuid'

export type MicrophoneRequestState = 'pending' | 'granted' | 'denied' | 'cancelled'
const requests = new Map<string, { state: MicrophoneRequestState; acquiring: boolean }>()

export function startMicrophoneRequest() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('microphone_unavailable')
  }
  for (const [id, request] of requests) {
    if (request.acquiring) {
      throw new Error('microphone_request_already_pending')
    }
    if (requests.size >= 100) {
      requests.delete(id)
    }
  }
  const operationId = createNonSecureContextUuid()
  const request: { state: MicrophoneRequestState; acquiring: boolean } = {
    state: 'pending',
    acquiring: true
  }
  requests.set(operationId, request)
  void (async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
      if (request.state === 'pending') {
        request.state = 'granted'
      }
    } catch {
      if (request.state === 'pending') {
        request.state = 'denied'
      }
    } finally {
      request.acquiring = false
    }
  })()
  return readMicrophoneRequest(operationId)
}

export function readMicrophoneRequest(operationId: string) {
  const request = requests.get(operationId)
  if (!request) {
    throw new Error('microphone_request_not_found')
  }
  return {
    operationId,
    requestState: request.state,
    nativePending: request.acquiring,
    osPromptDismissed: false as const
  }
}

export function cancelMicrophoneRequest(operationId: string) {
  const request = requests.get(operationId)
  if (!request) {
    throw new Error('microphone_request_not_found')
  }
  if (request.state === 'pending') {
    request.state = 'cancelled'
  }
  return readMicrophoneRequest(operationId)
}

export function cancelPendingMicrophoneRequests(): void {
  for (const request of requests.values()) {
    if (request.state === 'pending') {
      request.state = 'cancelled'
    }
  }
}
