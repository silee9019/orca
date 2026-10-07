import { installClientHostedPaneApi } from '../client-hosted-browser-pane-test-rig'
import { useAppStore } from '@/store'
import { getDefaultSettings } from '../../../../../shared/constants'
import {
  useBrowserDriverForPage,
  setDriverForBrowserPage
} from '@/lib/pane-manager/browser-mobile-driver-state'
import { BrowserMobileDriverOverlay } from './BrowserMobileDriverOverlay'
export function seedBrowserTakeBackOwner(): void {
  installClientHostedPaneApi()
  useAppStore.setState({
    settings: getDefaultSettings('/fixture'),
    activeWorktreeId: 'folder:fixture',
    persistedUIReady: true
  })
  useAppStore.getState().createBrowserTab('folder:fixture', 'about:blank', {
    browserPageId: 'page',
    browserRuntimeEnvironmentId: null
  })
  setDriverForBrowserPage('page', { kind: 'mobile', clientId: 'fixture-phone' })
}
export function BrowserTakeBackFixture({ onTakeBack }: { onTakeBack: () => Promise<void> }) {
  const driver = useBrowserDriverForPage('page')
  const page = useAppStore((state) =>
    Object.values(state.browserPagesByWorkspace)
      .flat()
      .find((entry) => entry.id === 'page')
  )
  return (
    <BrowserMobileDriverOverlay
      driver={driver}
      onTakeBack={onTakeBack}
      commandOwner={
        page
          ? { page: page.id, worktreeId: page.worktreeId, workspaceId: page.workspaceId }
          : undefined
      }
    />
  )
}
