// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MobilePageContent } from './MobilePageContent'
import { useMobileInstallActions } from './use-mobile-install-actions'
import { getInstallCopy, ANDROID_INSTALL_GUIDE_URL } from './mobile-platform-copy'
import { applyMobileConnectionsViewerRequest } from '@/runtime/mobile-connections-viewer-controller'
import type { ConnectionsViewerCommand } from '../../../../shared/rpc-contract/connections-viewer-params'
import type { Platform } from './MobileHero'
import { TooltipProvider } from '../ui/tooltip'
const clipboard = vi.fn(),
  openUrl = vi.fn()
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
beforeEach(() => {
  vi.clearAllMocks()
  clipboard.mockResolvedValue(undefined)
  openUrl.mockResolvedValue(undefined)
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { ui: { writeClipboardText: clipboard }, shell: { openUrl } }
  })
})
afterEach(cleanup)
function Parent({ platform = 'ios' }: { platform?: Platform }) {
  const actions = useMobileInstallActions(platform, 'preview')
  return (
    <TooltipProvider>
      <MobilePageContent
        closeMobilePage={vi.fn()}
        copyInstallUrl={actions.copyInstallUrl}
        copyPairingCode={vi.fn()}
        devices={[]}
        enterFlow={vi.fn()}
        generatePairing={vi.fn()}
        canGeneratePairing={false}
        handleAddressChange={vi.fn()}
        customAddresses={[]}
        selectedAddressIsCustom={false}
        onCustomAddressSelect={vi.fn()}
        onCustomAddressRemove={vi.fn()}
        beforeCustomAddressChange={async () => true}
        handleBack={vi.fn()}
        handleContinue={vi.fn()}
        installQrUrl={null}
        iosChannel="preview"
        setIosChannel={vi.fn()}
        loadNetworkInterfaces={vi.fn()}
        networkInterfaces={[]}
        openAndroidInstallGuide={actions.openAndroidInstallGuide}
        openInstallUrl={actions.openInstallUrl}
        pairAnotherDevice={vi.fn()}
        pairLoading={false}
        connectionMode="local-only"
        handleConnectionModeChange={vi.fn()}
        pairQrDataUrl={null}
        pairQrSize={null}
        pairingUrl={null}
        pairingQrError={false}
        relayMintFailure={null}
        onUseLan={vi.fn()}
        onRetryRelay={vi.fn()}
        onCopyRelayDiagnostics={vi.fn()}
        platform={platform}
        refreshingNetworkInterfaces={false}
        revokeDevice={vi.fn()}
        revokingDeviceIds={[]}
        selectedAddress={undefined}
        setPlatform={vi.fn()}
        showMobileButton={true}
        showPairedDevices={vi.fn()}
        stage="intro"
        stepIdx={0}
        toggleMobileSidebarButton={vi.fn()}
      />
    </TooltipProvider>
  )
}
async function invoke(command: ConnectionsViewerCommand) {
  let result
  await act(async () => {
    result = await applyMobileConnectionsViewerRequest({
      id: 'install',
      expiresAt: Date.now() + 1000,
      command
    })
  })
  return result
}
it('copies the actual selected platform install URL through the existing parent hook without returning it', async () => {
  render(<Parent />)
  const result = await invoke({ viewerId: 7, operation: 'mobile.copy-install' })
  expect(result).toMatchObject({ applied: true, persisted: null })
  expect(clipboard).toHaveBeenCalledExactlyOnceWith(getInstallCopy('ios', 'preview').url)
  expect(JSON.stringify(result)).not.toContain(getInstallCopy('ios', 'preview').url)
})
it('opens install and Android guide through their original native callback owners', async () => {
  render(<Parent platform="android" />)
  expect(await invoke({ viewerId: 7, operation: 'mobile.open-install' })).toMatchObject({
    applied: true
  })
  expect(openUrl).toHaveBeenLastCalledWith(getInstallCopy('android', 'preview').url)
  expect(await invoke({ viewerId: 7, operation: 'mobile.open-android-guide' })).toMatchObject({
    applied: true
  })
  expect(openUrl).toHaveBeenLastCalledWith(ANDROID_INSTALL_GUIDE_URL)
})
it('does not acknowledge a failed native open or leak its error', async () => {
  openUrl.mockRejectedValue(new Error('private-open-error-canary'))
  render(<Parent />)
  const result = await invoke({ viewerId: 7, operation: 'mobile.open-install' })
  expect(result).toMatchObject({ applied: false })
  expect(JSON.stringify(result)).not.toContain('private-open-error-canary')
})

it('does not acknowledge clipboard failure or emit its private error value', async () => {
  clipboard.mockRejectedValue(new Error('private-clipboard-error-canary'))
  const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    render(<Parent />)
    const result = await invoke({ viewerId: 7, operation: 'mobile.copy-install' })
    expect(result).toMatchObject({ applied: false })
    expect(JSON.stringify(result)).not.toContain('private-clipboard-error-canary')
    expect(diagnostic).toHaveBeenCalledExactlyOnceWith('writeClipboardText failed')
  } finally {
    diagnostic.mockRestore()
  }
})
