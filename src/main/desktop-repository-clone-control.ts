export type DesktopRepositoryCloneControl = {
  controller: AbortController
  onProgress: (progress: { phase: string; percent: number }) => void
  validateHost: () => void
}
