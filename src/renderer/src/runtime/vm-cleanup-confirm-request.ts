export type VmCleanupConfirmRequest = { operation: 'open' | 'cancel'; runtimeId: string }
let receive: ((request: VmCleanupConfirmRequest) => boolean) | null = null
export function attachVmCleanupConfirmRequest(
  receiver: (request: VmCleanupConfirmRequest) => boolean
): () => void {
  receive = receiver
  return () => {
    if (receive === receiver) {
      receive = null
    }
  }
}
export function requestVmCleanupConfirm(request: VmCleanupConfirmRequest): boolean {
  if (!receive) {
    throw new Error('vm_cleanup_confirm_unavailable')
  }
  return receive(request)
}
