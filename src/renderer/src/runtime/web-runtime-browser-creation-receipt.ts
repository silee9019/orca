export type WebRuntimeBrowserCreationReceipt =
  | { phase: 'started' | 'invalidated' }
  | { phase: 'materialized'; environmentId: string; worktreeId: string; remotePageId: string }
export type WebRuntimeBrowserCreationObserver = (receipt: WebRuntimeBrowserCreationReceipt) => void
export function notifyWebRuntimeBrowserCreation(
  observer: WebRuntimeBrowserCreationObserver | undefined,
  receipt: WebRuntimeBrowserCreationReceipt
): void {
  try {
    observer?.(receipt)
  } catch {
    // Receipt delivery must not undo a materialized page.
  }
}
