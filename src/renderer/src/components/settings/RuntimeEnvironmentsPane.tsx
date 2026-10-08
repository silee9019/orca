import { useRuntimeServerViewer } from '@/runtime/runtime-server-viewer'
import { useEffect, useRef, useState } from 'react'
import { useRuntimeConnectionsViewerController } from '@/hooks/useRuntimeConnectionsViewerController'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { PublicKnownRuntimeEnvironment } from '../../../../shared/runtime-environments'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import { SearchableSetting } from './SearchableSetting'
import { EphemeralVmRuntimesSection } from './EphemeralVmRuntimesSection'
import { CloudVmSetupGuide } from './CloudVmSetupGuide'
import {
  getRuntimeEnvironmentsSearchEntry,
  getWebRuntimeEnvironmentsSearchEntry
} from './runtime-environments-search'
import { isRuntimeEnvironmentRemovalBlocked } from './runtime-environment-host-details'
import { RuntimeServersConnectSection } from './runtime-servers-connect-section'
import { RuntimeActiveServerSection } from './runtime-active-server-section'
import {
  RuntimeEnvironmentRemoveDialog,
  RuntimeEnvironmentSwitchDialog
} from './runtime-environment-dialogs'
import {
  RuntimeServerShareSection,
  RuntimeServerTroubleshooting,
  RuntimeServerWorkflowPicker,
  type RemoteServerWorkflow
} from './runtime-server-workflow-sections'
import { useRuntimeEnvironmentCatalog } from './use-runtime-environment-catalog'
import { useRuntimeEnvironmentConnectionActions } from './use-runtime-environment-connection-actions'
import { useRuntimeEnvironmentMutationActions } from './use-runtime-environment-mutation-actions'
import { LOCAL_RUNTIME_VALUE, NO_RUNTIME_VALUE } from './runtime-environment-selection'

export {
  evaluateHostDetails,
  getActiveServerModeDescription,
  getHostDetailsDescription,
  getHostDetailsSummary,
  getHostModelCapabilitySummary,
  getRuntimeCapabilitiesSummary,
  getRuntimeServerConnectionState,
  isRuntimeServerTransportConnected,
  isRuntimeEnvironmentRemovalBlocked
} from './runtime-environment-host-details'
export type { RuntimeHostDetails } from './runtime-environment-host-details'

type RuntimeEnvironmentsPaneProps = {
  settings: GlobalSettings
  setActiveRuntimeEnvironmentPreference: (environmentId: string | null) => Promise<boolean>
  setProfileRuntimeEnvironmentPreference?: (environmentId: string | null) => Promise<boolean>
  selectRuntimeEnvironmentForViewer?: (environmentId: string | null) => Promise<boolean>
  canGeneratePairingUrl?: boolean
  allowLocalRuntime?: boolean
  addServerIntentSignal?: number
}

export function RuntimeEnvironmentsPane({
  settings,
  setActiveRuntimeEnvironmentPreference,
  selectRuntimeEnvironmentForViewer,
  setProfileRuntimeEnvironmentPreference,
  canGeneratePairingUrl = true,
  allowLocalRuntime = true,
  addServerIntentSignal
}: RuntimeEnvironmentsPaneProps): React.JSX.Element {
  const [pendingSwitchValue, setPendingSwitchValue] = useState<string | null>(null)
  const [pendingRemove, setPendingRemove] = useState<PublicKnownRuntimeEnvironment | null>(null)
  const [addServerFormOpen, setAddServerFormOpen] = useState(false)
  const [shareServerFormOpen, setShareServerFormOpen] = useState(true)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [workflow, setWorkflow] = useState<RemoteServerWorkflow>('connect')
  const remoteServerUpdates = useAppStore((state) => state.remoteServerUpdates)
  const remoteServerUpdatesChecking = useAppStore((state) => state.remoteServerUpdatesChecking)
  const remoteServerUpdatesRunning = useAppStore((state) => state.remoteServerUpdatesRunning)
  const refreshRemoteServerUpdates = useAppStore((state) => state.refreshRemoteServerUpdates)
  const setRemoteServerUpdateDialogOpen = useAppStore(
    (state) => state.setRemoteServerUpdateDialogOpen
  )
  const consumedAddServerIntentSignalRef = useRef(0)
  const {
    environments,
    isLoading,
    detailsByEnvironmentId,
    setDetailsByEnvironmentId,
    mountedRef,
    loadEnvironments
  } = useRuntimeEnvironmentCatalog()

  const getEnvironmentLabel = (value: string): string => {
    if (value === LOCAL_RUNTIME_VALUE) {
      return 'Local desktop'
    }
    if (value === NO_RUNTIME_VALUE) {
      return 'No server connected'
    }
    return environments.find((environment) => environment.id === value)?.name ?? 'remote server'
  }
  const {
    connectingId,
    switchingValue,
    disconnectingId,
    switchError,
    setSwitchError,
    connectEnvironment,
    disconnectEnvironment,
    switchToValue
  } = useRuntimeEnvironmentConnectionActions({
    allowLocalRuntime,
    mountedRef,
    setDetailsByEnvironmentId,
    setActiveRuntimeEnvironmentPreference:
      setProfileRuntimeEnvironmentPreference ?? setActiveRuntimeEnvironmentPreference,
    getEnvironmentLabel
  })
  const {
    isSaving,
    removingId,
    removeError,
    setRemoveError,
    name,
    setName,
    pairingCode,
    setPairingCode,
    addServerFailure,
    setAddServerFailure,
    closeAddServerForm,
    addEnvironment,
    removeEnvironment
  } = useRuntimeEnvironmentMutationActions({
    environments,
    settings,
    allowLocalRuntime,
    mountedRef,
    setAddServerFormOpen,
    loadEnvironments,
    connectEnvironment
  })

  const requestSwitch = (value: string): void => {
    setSwitchError(null)
    setPendingSwitchValue(value)
  }
  const cancelSwitch = (): void => {
    setSwitchError(null)
    setPendingSwitchValue(null)
  }

  useRuntimeConnectionsViewerController({
    read: () => ({
      environmentId: settings.activeRuntimeEnvironmentId ?? null,
      pendingSwitchValue,
      workflow,
      addFormOpen: addServerFormOpen,
      shareFormOpen: shareServerFormOpen,
      advancedOpen,
      name,
      pairingCodeSet: pairingCode.length > 0
    }),
    profile: setProfileRuntimeEnvironmentPreference
      ? {
          select: setProfileRuntimeEnvironmentPreference,
          persisted: async (id) =>
            ((await window.api.settings.get()).activeRuntimeEnvironmentId ?? null) === id,
          request: (id) => requestSwitch(id ?? LOCAL_RUNTIME_VALUE),
          confirm: () => confirmSwitch(),
          cancel: () => cancelSwitch()
        }
      : undefined,
    matchesPairingCode: (value) => pairingCode === value,
    hasEnvironment: (id) =>
      id === null ? allowLocalRuntime : environments.some((environment) => environment.id === id),
    useEnvironment: async (id) => {
      if (!selectRuntimeEnvironmentForViewer) {
        throw new Error('viewer_selection_unavailable')
      }
      return selectRuntimeEnvironmentForViewer(id)
    },
    setWorkflow,
    setAddFormOpen: setAddServerFormOpen,
    setShareFormOpen: setShareServerFormOpen,
    setAdvancedOpen,
    setName,
    setPairingCode,
    cancelAdd: closeAddServerForm
  })

  const environmentIdsKey = environments.map((environment) => environment.id).join('\n')
  useEffect(() => {
    void refreshRemoteServerUpdates()
  }, [environmentIdsKey, refreshRemoteServerUpdates])
  useEffect(() => {
    if (
      !addServerIntentSignal ||
      consumedAddServerIntentSignalRef.current === addServerIntentSignal
    ) {
      return
    }
    consumedAddServerIntentSignalRef.current = addServerIntentSignal
    // Why: composer deep-links should land on the existing pairing form, not just
    // the server list.
    setAddServerFormOpen(true)
  }, [addServerIntentSignal])

  const activeValue =
    settings.activeRuntimeEnvironmentId ??
    (allowLocalRuntime ? LOCAL_RUNTIME_VALUE : NO_RUNTIME_VALUE)
  const isBusy =
    isSaving ||
    connectingId !== null ||
    switchingValue !== null ||
    removingId !== null ||
    disconnectingId !== null
  const removingActiveServer = pendingRemove
    ? isRuntimeEnvironmentRemovalBlocked(settings.activeRuntimeEnvironmentId, pendingRemove.id)
    : false
  const searchEntry = canGeneratePairingUrl
    ? getRuntimeEnvironmentsSearchEntry()
    : getWebRuntimeEnvironmentsSearchEntry()
  const visibleWorkflow: RemoteServerWorkflow = addServerFormOpen ? 'connect' : workflow

  const openRemoveDialog = (environment: PublicKnownRuntimeEnvironment): void => {
    setRemoveError(null)
    setPendingRemove(environment)
  }
  const confirmSwitch = async (): Promise<boolean> => {
    const value = pendingSwitchValue
    if (!value || switchingValue !== null) {
      return false
    }
    const switched = await switchToValue(value)
    if (switched && mountedRef.current) {
      setPendingSwitchValue(null)
    }
    return switched
  }
  const confirmRemove = async (): Promise<boolean> => {
    const environment = pendingRemove
    if (!environment) {
      return false
    }
    const removed = await removeEnvironment(environment)
    if (removed && mountedRef.current) {
      setPendingRemove(null)
    }
    return removed
  }

  useRuntimeServerViewer({
    read: () => ({
      visible: visibleWorkflow === 'connect',
      busy: isBusy || isLoading,
      addFormOpen: addServerFormOpen,
      pendingRemoveId: pendingRemove?.id ?? null,
      removeErrorSet: removeError !== null,
      updatesOpen: useAppStore.getState().remoteServerUpdateDialogOpen,
      environmentCount: environments.length
    }),
    refresh: () => loadEnvironments(),
    matchesRefresh: (result) => environments === result && !isLoading,
    add: (expectedName, expectedCode, allowLoopback) =>
      name.trim() === expectedName && pairingCode.trim() === expectedCode
        ? addEnvironment(allowLoopback)
        : Promise.resolve(false),
    connect: (id) => {
      const environment = environments.find((entry) => entry.id === id)
      return environment ? connectEnvironment(environment) : Promise.resolve(false)
    },
    disconnect: (id) => {
      const environment = environments.find((entry) => entry.id === id)
      return environment ? disconnectEnvironment(environment) : Promise.resolve(false)
    },
    removeOpen: (id) => {
      const environment = environments.find((entry) => entry.id === id)
      if (!environment) {
        return false
      }
      openRemoveDialog(environment)
      return true
    },
    removeCancel: () => {
      setRemoveError(null)
      setPendingRemove(null)
    },
    removeConfirm: confirmRemove,
    hasEnvironment: (id) => environments.some((entry) => entry.id === id),
    updates: setRemoteServerUpdateDialogOpen
  })

  return (
    <SearchableSetting
      title={searchEntry.title}
      description={searchEntry.description}
      keywords={searchEntry.keywords}
      className="space-y-4 py-2"
    >
      <RuntimeServerWorkflowPicker
        canGeneratePairingUrl={canGeneratePairingUrl}
        visibleWorkflow={visibleWorkflow}
        onCloseAddServerForm={closeAddServerForm}
        onWorkflowChange={setWorkflow}
      />

      <RuntimeServersConnectSection
        visible={visibleWorkflow === 'connect'}
        environments={environments}
        detailsByEnvironmentId={detailsByEnvironmentId}
        activeRuntimeEnvironmentId={settings.activeRuntimeEnvironmentId}
        addServerFormOpen={addServerFormOpen}
        name={name}
        pairingCode={pairingCode}
        addServerFailure={addServerFailure}
        isBusy={isBusy}
        remoteServerUpdates={remoteServerUpdates}
        remoteServerUpdatesChecking={remoteServerUpdatesChecking}
        remoteServerUpdatesRunning={remoteServerUpdatesRunning}
        connectingId={connectingId}
        switchingValue={switchingValue}
        disconnectingId={disconnectingId}
        removingId={removingId}
        onOpenAddServerForm={() => setAddServerFormOpen(true)}
        onCloseAddServerForm={closeAddServerForm}
        onNameChange={setName}
        onPairingCodeChange={(value) => {
          setPairingCode(value)
          setAddServerFailure(null)
        }}
        onAddEnvironment={(allowLoopback) => void addEnvironment(allowLoopback)}
        onOpenUpdateDialog={() => setRemoteServerUpdateDialogOpen(true)}
        refreshRemoteServerUpdates={refreshRemoteServerUpdates}
        onConnect={(environment) => void connectEnvironment(environment)}
        onDisconnect={(environment) => void disconnectEnvironment(environment)}
        onRemove={openRemoveDialog}
      />

      <div className={cn('space-y-5 pt-2', visibleWorkflow !== 'cloud-vm' && 'hidden')}>
        <CloudVmSetupGuide />
        <EphemeralVmRuntimesSection active={visibleWorkflow === 'cloud-vm'} />
      </div>

      <RuntimeActiveServerSection
        visible={visibleWorkflow === 'connect'}
        advancedOpen={advancedOpen}
        allowLocalRuntime={allowLocalRuntime}
        localRuntimeValue={LOCAL_RUNTIME_VALUE}
        noRuntimeValue={NO_RUNTIME_VALUE}
        activeValue={activeValue}
        environments={environments}
        detailsByEnvironmentId={detailsByEnvironmentId}
        isBusy={isBusy}
        isLoading={isLoading}
        onToggleAdvanced={() => setAdvancedOpen((current) => !current)}
        onValueChange={requestSwitch}
        onRefresh={() => void loadEnvironments()}
      />

      {visibleWorkflow === 'share' && canGeneratePairingUrl ? (
        <RuntimeServerShareSection
          shareServerFormOpen={shareServerFormOpen}
          onToggleShareServerForm={() => setShareServerFormOpen((open) => !open)}
        />
      ) : null}

      {visibleWorkflow === 'connect' ? <RuntimeServerTroubleshooting /> : null}

      <RuntimeEnvironmentSwitchDialog
        pendingSwitchValue={pendingSwitchValue}
        switchingValue={switchingValue}
        switchError={switchError}
        getEnvironmentLabel={getEnvironmentLabel}
        onOpenChange={(open) => {
          if (!open && switchingValue === null) {
            cancelSwitch()
          }
        }}
        onCancel={cancelSwitch}
        onConfirm={confirmSwitch}
      />

      <RuntimeEnvironmentRemoveDialog
        pendingRemove={pendingRemove}
        removingId={removingId}
        removeError={removeError}
        removingActiveServer={removingActiveServer}
        onOpenChange={(open) => {
          if (!open && removingId === null) {
            setRemoveError(null)
            setPendingRemove(null)
          }
        }}
        onCancel={() => {
          setRemoveError(null)
          setPendingRemove(null)
        }}
        onConfirm={confirmRemove}
      />
    </SearchableSetting>
  )
}
