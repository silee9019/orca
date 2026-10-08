const EVENT_NAME = 'orca:voice-key-dialog'
export function requestVoiceKeyDialog(open: boolean, modelId: string | null = null): void {
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { open, modelId } }))
}
export function attachVoiceKeyDialogRequest(
  onRequest: (open: boolean, modelId: string | null) => void
): () => void {
  const receive = (event: Event): void => {
    if (event instanceof CustomEvent && typeof event.detail?.open === 'boolean') {
      onRequest(
        event.detail.open,
        typeof event.detail.modelId === 'string' ? event.detail.modelId : null
      )
    }
  }
  window.addEventListener(EVENT_NAME, receive)
  return () => window.removeEventListener(EVENT_NAME, receive)
}
