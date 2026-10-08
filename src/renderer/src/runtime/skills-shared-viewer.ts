import { isWebClientLocation } from '@/lib/web-client-location'
import { useAppStore } from '@/store'
import type { ConnectionsViewerRequest } from '../../../shared/connections-viewer'
import {
  SkillsSharedViewerParams,
  type SkillsSharedViewerResult
} from '../../../shared/skills-shared-viewer'
export async function applySkillsSharedViewerRequest(
  request: ConnectionsViewerRequest
): Promise<SkillsSharedViewerResult> {
  const command = SkillsSharedViewerParams.parse(request.command)
  if (Date.now() >= request.expiresAt) {
    throw new Error('request_expired')
  }
  if (
    isWebClientLocation() ||
    useAppStore.getState().orcaProfileAuthStatus?.state !== 'connected'
  ) {
    throw new Error('skills_shared_view_unavailable')
  }
  useAppStore.getState().openSkillsSharedLinks()
  while (Date.now() < request.expiresAt) {
    const state = useAppStore.getState()
    if (state.activeView !== 'skills') {
      throw new Error('viewer_selection_changed')
    }
    if (!state.pendingSkillsSharedView) {
      return {
        viewerId: command.viewerId,
        applied: true,
        persisted: null,
        state: { activeView: 'skills', sharedViewApplied: true }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('viewer_not_applied')
}
