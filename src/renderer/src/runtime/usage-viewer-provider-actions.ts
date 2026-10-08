import { useAppStore } from '../store'
import type { z } from 'zod'
import type { UsageProvider } from '../../../shared/rpc-contract/usage-params'

export async function applyUsageViewerProviderAction(
  provider: z.infer<typeof UsageProvider>,
  enabled?: boolean
) {
  switch (provider) {
    case 'claude':
      await (enabled === undefined
        ? useAppStore.getState().refreshClaudeUsage()
        : useAppStore.getState().setClaudeUsageEnabled(enabled))
      break
    case 'codex':
      await (enabled === undefined
        ? useAppStore.getState().refreshCodexUsage()
        : useAppStore.getState().setCodexUsageEnabled(enabled))
      break
    case 'opencode':
      await (enabled === undefined
        ? useAppStore.getState().refreshOpenCodeUsage()
        : useAppStore.getState().setOpenCodeUsageEnabled(enabled))
      break
    case 'muse':
      await (enabled === undefined
        ? useAppStore.getState().refreshMuseUsage()
        : useAppStore.getState().setMuseUsageEnabled(enabled))
      break
  }
  const state = useAppStore.getState()
  const scanState =
    provider === 'claude'
      ? state.claudeUsageScanState
      : provider === 'codex'
        ? state.codexUsageScanState
        : provider === 'opencode'
          ? state.openCodeUsageScanState
          : state.museUsageScanState
  if (!scanState || (enabled !== undefined && scanState.enabled !== enabled)) {
    throw new Error('usage_viewer_state_not_applied')
  }
  return { provider, scanState }
}

export async function refreshUsageViewerOverview() {
  const state = useAppStore.getState()
  const scanStates = [
    state.claudeUsageScanState,
    state.codexUsageScanState,
    state.openCodeUsageScanState,
    state.museUsageScanState
  ]
  if (!scanStates.some((scan) => scan?.enabled) || scanStates.some((scan) => scan?.isScanning)) {
    throw new Error('usage_overview_refresh_disabled')
  }
  const providers: z.infer<typeof UsageProvider>[] = []
  if (state.claudeUsageScanState?.enabled) {
    providers.push('claude')
  }
  if (state.codexUsageScanState?.enabled) {
    providers.push('codex')
  }
  if (state.openCodeUsageScanState?.enabled) {
    providers.push('opencode')
  }
  if (state.museUsageScanState?.enabled) {
    providers.push('muse')
  }
  await Promise.all(providers.map((provider) => applyUsageViewerProviderAction(provider)))
  return { provider: 'overview', providers }
}
