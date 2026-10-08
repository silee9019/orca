type VmPaneAction = 'refresh' | 'copy'
let receive: ((action: VmPaneAction) => Promise<boolean>) | null = null
export function attachVmPaneRequest(
  receiver: (action: VmPaneAction) => Promise<boolean>
): () => void {
  receive = receiver
  return () => {
    if (receive === receiver) {
      receive = null
    }
  }
}
export function requestVmPaneAction(action: VmPaneAction): Promise<boolean> {
  if (!receive) {
    throw new Error('vm_pane_unavailable')
  }
  return receive(action)
}
