import { createNonSecureContextUuid } from '../../../shared/non-secure-context-uuid'
export type VoicePaneAction = 'toggle' | 'refresh-models' | 'save-key' | 'clear-key'
type PaneOperation = { operationId: string; paneState: 'pending' | 'succeeded' | 'failed' }
let receive: ((action: VoicePaneAction) => Promise<boolean>) | null = null
const operations = new Map<string, PaneOperation>()
export function attachVoicePaneRequest(
  receiver: (action: VoicePaneAction) => Promise<boolean>
): () => void {
  receive = receiver
  return () => {
    if (receive === receiver) {
      receive = null
    }
  }
}
export function startVoicePaneRequest(action: VoicePaneAction): PaneOperation {
  if (!receive) {
    throw new Error('voice_pane_unavailable')
  }
  for (const [id, value] of operations) {
    if (value.paneState === 'pending') {
      throw new Error('voice_pane_busy')
    }
    if (operations.size >= 100) {
      operations.delete(id)
    }
  }
  const operationId = createNonSecureContextUuid()
  const value: PaneOperation = { operationId, paneState: 'pending' }
  operations.set(operationId, value)
  const run = receive
  void Promise.resolve()
    .then(() => run(action))
    .then(
      (ok) => {
        value.paneState = ok ? 'succeeded' : 'failed'
      },
      () => {
        value.paneState = 'failed'
      }
    )
  return { ...value }
}
export function readVoicePaneRequest(operationId: string): PaneOperation {
  const value = operations.get(operationId)
  if (!value) {
    throw new Error('voice_pane_operation_not_found')
  }
  return { ...value }
}
