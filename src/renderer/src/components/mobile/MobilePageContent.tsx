import { useMobileConnectionsViewerController } from '@/hooks/useMobileConnectionsViewerController'
import { translate } from '@/i18n/i18n'
import type { MobileNetworkInterface } from '../settings/mobile-network-interface-selection'
import {
  HeroFlow,
  HeroIntro,
  HeroPaired,
  type PairedDevice,
  type Platform,
  type StepIndex
} from './MobileHero'
import { getInstallCopy, type IosChannel } from './mobile-platform-copy'
import type { MobilePageStage } from './mobile-page-stage'
import { MobilePageToolbar } from './MobilePageToolbar'
import { PhoneCarousel } from './PhoneCarousel'
import type { MobilePairingConnectionMode } from '../../../../shared/mobile-pairing-connection-mode'
import type { MobileRelayMintFailure } from '../../../../shared/mobile-relay-mint-failure'

type MobilePageContentProps = {
  closeMobilePage: () => boolean | void
  readPageOpen?: () => boolean
  copyInstallUrl: () => Promise<boolean> | void
  copyPairingCode: () => Promise<boolean> | void
  devices: readonly PairedDevice[]
  enterFlow: () => void
  generatePairing: (rotate: boolean) => void
  canGeneratePairing: boolean
  handleAddressChange: (address: string) => void
  customAddresses: readonly string[]
  selectedAddressIsCustom: boolean
  onCustomAddressSelect: (address: string) => void
  onCustomAddressRemove: (address: string) => void
  beforeCustomAddressChange: (address: string) => Promise<boolean>
  handleBack: () => void
  handleContinue: () => void
  installQrUrl: string | null
  iosChannel: IosChannel
  setIosChannel: (channel: IosChannel) => void
  loadNetworkInterfaces: () => Promise<readonly MobileNetworkInterface[] | null> | void
  networkInterfaces: MobileNetworkInterface[]
  openAndroidInstallGuide: () => Promise<boolean> | void
  openInstallUrl: () => Promise<boolean> | void
  pairAnotherDevice: () => void
  pairLoading: boolean
  connectionMode: MobilePairingConnectionMode
  handleConnectionModeChange: (mode: MobilePairingConnectionMode) => void
  pairQrDataUrl: string | null
  pairQrSize: number | null
  pairingUrl: string | null
  pairingQrError: boolean
  relayMintFailure: MobileRelayMintFailure | null
  onUseLan: () => void
  onRetryRelay: () => void
  onCopyRelayDiagnostics: () => Promise<boolean> | void
  platform: Platform
  refreshingNetworkInterfaces: boolean
  revokeDevice: (id: string) => Promise<boolean> | void
  revokingDeviceIds: readonly string[]
  selectedAddress: string | undefined
  setPlatform: (platform: Platform) => void
  showMobileButton: boolean
  showPairedDevices: (deviceCount: number) => void
  stage: MobilePageStage | null
  stepIdx: StepIndex
  toggleMobileSidebarButton: () => Promise<{
    applied: boolean
    persisted: boolean
    value: boolean
  }> | void
}

export function MobilePageContent({
  closeMobilePage,
  readPageOpen,
  copyInstallUrl,
  copyPairingCode,
  devices,
  enterFlow,
  generatePairing,
  canGeneratePairing,
  handleAddressChange,
  customAddresses,
  selectedAddressIsCustom,
  onCustomAddressSelect,
  onCustomAddressRemove,
  beforeCustomAddressChange,
  handleBack,
  handleContinue,
  installQrUrl,
  iosChannel,
  setIosChannel,
  loadNetworkInterfaces,
  networkInterfaces,
  openAndroidInstallGuide,
  openInstallUrl,
  pairAnotherDevice,
  pairLoading,
  connectionMode,
  handleConnectionModeChange,
  pairQrDataUrl,
  pairQrSize,
  pairingUrl,
  pairingQrError,
  relayMintFailure,
  onUseLan,
  onRetryRelay,
  onCopyRelayDiagnostics,
  platform,
  refreshingNetworkInterfaces,
  revokeDevice,
  revokingDeviceIds,
  selectedAddress,
  setPlatform,
  showMobileButton,
  showPairedDevices,
  stage,
  stepIdx,
  toggleMobileSidebarButton
}: MobilePageContentProps): React.JSX.Element {
  useMobileConnectionsViewerController({
    closePage: closeMobilePage,
    pageOpen: readPageOpen,
    toggleSidebar: async () => toggleMobileSidebarButton(),
    sidebarShown: () => showMobileButton,
    refreshNetwork: async () => loadNetworkInterfaces(),
    networkInterfaces: () => networkInterfaces,
    copyDiagnostics: async () => onCopyRelayDiagnostics(),
    hasDevice: (id) => devices.some((device) => device.deviceId === id),
    isRevokingDevice: (id) => revokingDeviceIds.includes(id),
    revokeDevice: async (id) => revokeDevice(id),
    copyPairing: async () => copyPairingCode(),
    copyInstall: async () => copyInstallUrl(),
    openInstall: async () => openInstallUrl(),
    openAndroidGuide: async () => openAndroidInstallGuide(),
    read: () => ({
      pageOpen: readPageOpen?.(),
      showMobileButton,
      platform,
      iosChannel,
      connectionMode,
      selectedAddress: selectedAddress ?? null,
      customAddresses: [...customAddresses],
      stage,
      step: stepIdx,
      pairingAvailable: pairingUrl !== null,
      pairingLoading: pairLoading,
      relayFailed: relayMintFailure !== null,
      deviceCount: devices.length
    }),
    pairingIdentity: () => pairingUrl,
    relayFailureIdentity: () => relayMintFailure,
    canGeneratePairing: () => canGeneratePairing,
    setPlatform,
    setIosChannel,
    setConnectionMode: handleConnectionModeChange,
    selectAddress: handleAddressChange,
    beforeCustomAddressChange,
    addCustomAddress: onCustomAddressSelect,
    removeCustomAddress: onCustomAddressRemove,
    start: enterFlow,
    back: handleBack,
    continue: handleContinue,
    done: showPairedDevices,
    pairAnother: pairAnotherDevice,
    useLan: onUseLan,
    generate: () => generatePairing(true),
    retryRelay: onRetryRelay
  })
  return (
    <div className="mobile-page-root scrollbar-sleek">
      <MobilePageToolbar
        showMobileButton={showMobileButton}
        onClose={closeMobilePage}
        onToggleMobileSidebarButton={toggleMobileSidebarButton}
      />
      <section className="mp-hero">
        <div className="mp-hero-copy">
          {stage === null ? null : stage === 'intro' ? (
            <HeroIntro onStart={enterFlow} />
          ) : stage === 'paired' ? (
            <HeroPaired
              devices={devices}
              onPairAnother={pairAnotherDevice}
              onRevoke={(id) => revokeDevice(id)}
              revokingDeviceIds={revokingDeviceIds}
            />
          ) : (
            <HeroFlow
              stepIdx={stepIdx}
              platform={platform}
              onPlatformChange={setPlatform}
              installQrUrl={installQrUrl}
              installCopy={getInstallCopy(platform, iosChannel)}
              iosChannel={iosChannel}
              onIosChannelChange={setIosChannel}
              onOpenAndroidInstallGuide={openAndroidInstallGuide}
              onOpenInstallUrl={openInstallUrl}
              onCopyInstallUrl={copyInstallUrl}
              pairQrDataUrl={pairQrDataUrl}
              pairQrSize={pairQrSize}
              pairingUrl={pairingUrl}
              pairingQrError={pairingQrError}
              relayMintFailure={relayMintFailure}
              onUseLan={onUseLan}
              onRetryRelay={onRetryRelay}
              onCopyRelayDiagnostics={onCopyRelayDiagnostics}
              pairLoading={pairLoading}
              connectionMode={connectionMode}
              onConnectionModeChange={handleConnectionModeChange}
              onRegeneratePairing={() => generatePairing(true)}
              canGeneratePairing={canGeneratePairing}
              onCopyPairingCode={copyPairingCode}
              networkInterfaces={networkInterfaces}
              customAddresses={customAddresses}
              selectedAddress={selectedAddress}
              selectedAddressIsCustom={selectedAddressIsCustom}
              onSelectedAddressChange={handleAddressChange}
              onCustomAddressSelect={onCustomAddressSelect}
              onCustomAddressRemove={onCustomAddressRemove}
              beforeCustomAddressChange={beforeCustomAddressChange}
              onRefreshNetworkInterfaces={loadNetworkInterfaces}
              refreshingNetworkInterfaces={refreshingNetworkInterfaces}
              onBack={handleBack}
              onContinue={handleContinue}
              onDone={devices.length > 0 ? () => showPairedDevices(devices.length) : undefined}
            />
          )}
        </div>

        <div
          className="mp-stage"
          aria-label={translate('auto.components.mobile.MobilePage.e17393c6a3', 'Phone preview')}
        >
          <PhoneCarousel />
        </div>
      </section>
    </div>
  )
}
