import type { AppState } from '../store/types'
import { UsageViewerFilterParams } from '../../../shared/rpc-contract/usage-params'

export type UsageViewerFilterState = Pick<
  AppState,
  | 'claudeUsageScope'
  | 'claudeUsageRange'
  | 'codexUsageScope'
  | 'codexUsageRange'
  | 'openCodeUsageScope'
  | 'openCodeUsageRange'
  | 'museUsageScope'
  | 'museUsageRange'
  | 'setClaudeUsageScope'
  | 'setClaudeUsageRange'
  | 'setCodexUsageScope'
  | 'setCodexUsageRange'
  | 'setOpenCodeUsageScope'
  | 'setOpenCodeUsageRange'
  | 'setMuseUsageScope'
  | 'setMuseUsageRange'
>

export async function applyUsageViewerFilters(
  input: unknown,
  getState: () => UsageViewerFilterState
) {
  const { provider, scope, range } = UsageViewerFilterParams.parse(input)
  switch (provider) {
    case 'claude': {
      if (scope !== undefined) {
        await getState().setClaudeUsageScope(scope)
      }
      if (range !== undefined) {
        await getState().setClaudeUsageRange(range)
      }
      const state = getState()
      return { provider, scope: state.claudeUsageScope, range: state.claudeUsageRange }
    }
    case 'codex': {
      if (scope !== undefined) {
        await getState().setCodexUsageScope(scope)
      }
      if (range !== undefined) {
        await getState().setCodexUsageRange(range)
      }
      const state = getState()
      return { provider, scope: state.codexUsageScope, range: state.codexUsageRange }
    }
    case 'opencode': {
      if (scope !== undefined) {
        await getState().setOpenCodeUsageScope(scope)
      }
      if (range !== undefined) {
        await getState().setOpenCodeUsageRange(range)
      }
      const state = getState()
      return { provider, scope: state.openCodeUsageScope, range: state.openCodeUsageRange }
    }
    case 'muse': {
      if (scope !== undefined) {
        await getState().setMuseUsageScope(scope)
      }
      if (range !== undefined) {
        await getState().setMuseUsageRange(range)
      }
      const state = getState()
      return { provider, scope: state.museUsageScope, range: state.museUsageRange }
    }
  }
}
