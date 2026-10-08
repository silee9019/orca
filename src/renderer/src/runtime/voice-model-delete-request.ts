import { createNonSecureContextUuid } from '../../../shared/non-secure-context-uuid'
type DeleteState = {
  operationId: string
  modelId: string
  deleteState: 'pending' | 'succeeded' | 'failed'
}
let receive: ((modelId: string) => Promise<void>) | null = null
const operations = new Map<string, DeleteState>()
export function attachVoiceModelDeleteRequest(
  receiver: (modelId: string) => Promise<void>
): () => void {
  receive = receiver
  return () => {
    if (receive === receiver) {
      receive = null
    }
  }
}
export function startVoiceModelDelete(modelId: string): DeleteState {
  if (!receive) {
    throw new Error('voice_model_viewer_unavailable')
  }
  for (const [id, value] of operations) {
    if (value.modelId === modelId && value.deleteState === 'pending') {
      throw new Error('voice_model_delete_pending')
    }
    if (operations.size >= 100 && value.deleteState !== 'pending') {
      operations.delete(id)
    }
  }
  if (operations.size >= 100) {
    throw new Error('voice_model_delete_capacity')
  }
  const operationId = createNonSecureContextUuid()
  const value: DeleteState = { operationId, modelId, deleteState: 'pending' }
  operations.set(operationId, value)
  void receive(modelId).then(
    () => {
      value.deleteState = 'succeeded'
    },
    () => {
      value.deleteState = 'failed'
    }
  )
  return { ...value }
}
export function readVoiceModelDelete(operationId: string): DeleteState {
  const value = operations.get(operationId)
  if (!value) {
    throw new Error('voice_model_delete_not_found')
  }
  return { ...value }
}
