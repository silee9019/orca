import { useAppStore } from '@/store'

export function requireHostViewer(): ReturnType<typeof useAppStore.getState> {
  const state = useAppStore.getState()
  if (!state.persistedUIReady || !state.settings) {
    throw new Error('viewer_not_ready')
  }
  if (state.settings.activeRuntimeEnvironmentId) {
    throw new Error('viewer_runtime_mismatch')
  }
  return state
}

export async function waitForView(test: () => boolean, expiresAt: number): Promise<boolean> {
  while (Date.now() < expiresAt) {
    requireHostViewer()
    if (test()) {
      return true
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
  return false
}
