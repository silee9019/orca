export type DesktopRemoteCloneControl = {
  controller: AbortController
  onProgress: (progress: { phase: string; percent: number }) => void
  validateHost: () => void
}
