import { vi } from 'vitest'
import { installClientHostedPaneApi } from '@/components/browser-pane/client-hosted-browser-pane-test-rig'
export function installBrowserObservationApi(): void {
  const subscription = () => vi.fn(() => () => {})
  installClientHostedPaneApi({
    ui: { onFullscreenChanged: subscription() },
    browser: {
      onGuestLoadFailed: subscription(),
      onNavigationUpdate: subscription(),
      onActivateView: subscription(),
      onCapturePaintHold: subscription(),
      onPaneFocus: subscription(),
      onOpenLinkInOrcaTab: subscription()
    }
  })
  Reflect.set(window.api, 'runtime', {
    onTerminalFitOverrideChanged: subscription(),
    onTerminalDriverChanged: subscription(),
    onBrowserDriverChanged: subscription(),
    onClientHostedBrowserRowsChanged: subscription(),
    getClientHostedBrowserRows: vi.fn(async () => []),
    getTerminalFitOverrides: vi.fn(async () => []),
    getTerminalDrivers: vi.fn(async () => []),
    getBrowserDrivers: vi.fn(async () => [])
  })
}
