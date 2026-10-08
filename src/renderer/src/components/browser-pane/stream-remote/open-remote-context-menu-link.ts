import { useAppStore } from '@/store'
import { openWorkspaceBrowserTab } from '@/lib/workspace-browser-tab-open'
import { resolveBrowserSourceUnifiedTab } from '@/lib/browser-workspace-source-resolution'
import type { RemoteBrowserPaneNotice } from './remote-browser-page-input-model'
export async function openRemoteContextMenuLink(
  browserPageId: string,
  worktreeId: string,
  environmentId: string,
  url: string,
  setPaneNotice: (notice: RemoteBrowserPaneNotice | null) => void
): Promise<void> {
  const source = resolveBrowserSourceUnifiedTab(useAppStore.getState(), browserPageId, worktreeId)
  try {
    await openWorkspaceBrowserTab({
      workspaceId: worktreeId,
      url,
      ...(source ? { afterTabId: source.id } : {}),
      focusOnCreate: false,
      selectWorktree: false,
      intent: { kind: 'url' },
      expectedRuntimeEnvironmentId: environmentId,
      placementPreference: 'server'
    })
  } catch (error) {
    setPaneNotice({ kind: 'direct', text: error instanceof Error ? error.message : String(error) })
    throw error
  }
}
