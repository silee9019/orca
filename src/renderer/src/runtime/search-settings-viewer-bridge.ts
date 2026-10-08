import {
  SearchSettingsViewerParams,
  type SearchSettingsViewerRequest,
  type SearchSettingsViewerResult
} from '../../../shared/search-settings-viewer'
import { isWebClientLocation } from '@/lib/web-client-location'
import { parseExecutionHostId } from '../../../shared/execution-host'
import { requestSearchSettings } from './search-settings-request'
import { requireHostViewer, waitForView } from './voice-viewer-target'

export async function applySearchSettingsViewerRequest(
  request: SearchSettingsViewerRequest
): Promise<Omit<SearchSettingsViewerResult, 'viewerId'>> {
  const command = SearchSettingsViewerParams.parse(request.command)
  if (isWebClientLocation()) {
    throw new Error('search_settings_desktop_required')
  }
  const state = requireHostViewer()
  if (Date.now() >= request.expiresAt) {
    throw new Error('request_expired')
  }
  state.openSettingsTarget({ pane: 'session-history', repoId: null })
  state.openSettingsPage()
  if (
    !(await waitForView(
      () => !!document.querySelector('[data-search-settings-pane]'),
      request.expiresAt
    ))
  ) {
    throw new Error('search_settings_owner_unavailable')
  }
  const result = await requestSearchSettings(command, request.expiresAt)
  requireHostViewer()
  if (command.operation === 'list-toggle') {
    result.applied =
      result.applied &&
      (await waitForView(
        () =>
          document
            .querySelector('[data-search-computers-expanded]')
            ?.getAttribute('data-search-computers-expanded') === String(result.expanded),
        request.expiresAt
      ))
  }
  if (command.operation === 'server-settings-open') {
    const host = parseExecutionHostId(command.executionHostId)
    if (host?.kind !== 'runtime') {
      throw new Error('search_settings_invalid_host')
    }
    result.applied =
      result.applied &&
      (await waitForView(() => {
        const target = requireHostViewer().settingsNavigationTarget
        return target?.pane === 'servers' && target.sectionId === host.environmentId
      }, request.expiresAt))
  }
  if (Date.now() >= request.expiresAt) {
    throw new Error('search_settings_timeout_effect_unknown')
  }
  return result
}

export function attachSearchSettingsViewerBridge(): () => void {
  if (!window.api.ui.onSearchSettingsViewerRequest || !window.api.ui.respondSearchSettingsViewer) {
    return () => {}
  }
  return window.api.ui.onSearchSettingsViewerRequest((request) => {
    void applySearchSettingsViewerRequest(request).then(
      (result) =>
        window.api.ui.respondSearchSettingsViewer?.({
          id: request.id,
          ok: true,
          result: { ...result, viewerId: 0 }
        }),
      (error) =>
        window.api.ui.respondSearchSettingsViewer?.({
          id: request.id,
          ok: false,
          error:
            error instanceof Error && /^[a-z][a-z0-9_]*$/.test(error.message)
              ? error.message
              : 'search_settings_failed'
        })
    )
  })
}
