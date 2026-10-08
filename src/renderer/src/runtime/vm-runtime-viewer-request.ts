import { createNonSecureContextUuid } from '../../../shared/non-secure-context-uuid'
export type VmRuntimeViewerAction = {
  action: 'refresh' | 'cleanup' | 'stop' | 'copy'
  runtimeId?: string
  confirmation?: string
}
type Operation = { operationId: string; vmActionState: 'pending' | 'succeeded' | 'failed' }
let receive: ((action: VmRuntimeViewerAction) => Promise<boolean>) | null = null
const operations = new Map<string, Operation>()
export function attachVmRuntimeViewerRequest(
  receiver: (action: VmRuntimeViewerAction) => Promise<boolean>
): () => void {
  receive = receiver
  return () => {
    if (receive === receiver) {
      receive = null
    }
  }
}
export function startVmRuntimeViewerRequest(action: VmRuntimeViewerAction): Operation {
  if (!receive) {
    throw new Error('vm_runtime_viewer_unavailable')
  }
  for (const [id, value] of operations) {
    if (value.vmActionState === 'pending') {
      throw new Error('vm_runtime_viewer_busy')
    }
    if (operations.size >= 100) {
      operations.delete(id)
    }
  }
  const operationId = createNonSecureContextUuid()
  const value: Operation = { operationId, vmActionState: 'pending' }
  operations.set(operationId, value)
  const run = receive
  void Promise.resolve()
    .then(() => run(action))
    .then(
      (ok) => {
        value.vmActionState = ok ? 'succeeded' : 'failed'
      },
      () => {
        value.vmActionState = 'failed'
      }
    )
  return { ...value }
}
export function readVmRuntimeViewerRequest(operationId: string): Operation {
  const value = operations.get(operationId)
  if (!value) {
    throw new Error('vm_runtime_viewer_operation_not_found')
  }
  return { ...value }
}
