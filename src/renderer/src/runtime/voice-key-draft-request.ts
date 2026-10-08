let receiveDraft: ((draft: string) => boolean) | null = null
export function attachVoiceKeyDraftRequest(receiver: (draft: string) => boolean): () => void {
  receiveDraft = receiver
  return () => {
    if (receiveDraft === receiver) {
      receiveDraft = null
    }
  }
}
export function requestVoiceKeyDraft(draft: string): boolean {
  if (!receiveDraft) {
    throw new Error('voice_key_dialog_unavailable')
  }
  return receiveDraft(draft)
}
