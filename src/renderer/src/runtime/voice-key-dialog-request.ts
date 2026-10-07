const EVENT_NAME = 'orca:voice-key-dialog'
export function requestVoiceKeyDialog(open: boolean): void {
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { open } }))
}
export function attachVoiceKeyDialogRequest(onRequest: (open: boolean) => void): () => void {
  const receive = (event: Event): void => {
    if (event instanceof CustomEvent && typeof event.detail?.open === 'boolean') {
      onRequest(event.detail.open)
    }
  }
  window.addEventListener(EVENT_NAME, receive)
  return () => window.removeEventListener(EVENT_NAME, receive)
}
