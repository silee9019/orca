import { useCallback, useEffect, useMemo, useState } from 'react'
import { useBrowserCookieSectionScroll } from './use-browser-cookie-section-scroll'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { useAppStore } from '../../store'
import { useBrowserSettingsRequest } from './use-browser-settings-request'
import { matchesSettingsSearch } from './settings-search'
import { getBrowserPaneSearchEntries } from './browser-search'
import { getBrowserLinkRoutingDescription } from './browser-link-routing-copy'
import { getBrowserUsePaneSearchEntries } from './browser-use-search'
import { getBrowserPaneCombinedSearchEntries } from './browser-pane-search'
import { BrowserHomePageSetting } from './BrowserHomePageSetting'
import { BrowserDefaultZoomSetting } from './BrowserDefaultZoomSetting'
import { BrowserUseSetup } from './BrowserUsePane'
import { BrowserSearchEngineSetting } from './BrowserSearchEngineSetting'
import { BrowserLinkRoutingSetting } from './BrowserLinkRoutingSetting'
import { BrowserLinkRoutingModifierSetting } from './BrowserLinkRoutingModifierSetting'
import { BrowserTerminalLinkActionsSetting } from './BrowserTerminalLinkActionsSetting'
import { BrowserLocalhostWorktreeLabelsSetting } from './BrowserLocalhostWorktreeLabelsSetting'
import { BrowserClientHostedRemoteSetting } from './BrowserClientHostedRemoteSetting'
import { BrowserSshWorkspaceRoutingSetting } from './BrowserSshWorkspaceRoutingSetting'
import { BrowserUserAgentSetting } from './BrowserUserAgentSetting'
import { SettingsSubsectionHeader } from './SettingsFormControls'
import { BrowserSessionCookiesSection } from './BrowserSessionCookiesSection'
import { BrowserNewProfileDialog } from './BrowserNewProfileDialog'
import {
  createBrowserHomePageDraftState,
  resolveBrowserHomePageDraftState
} from './browser-home-page-draft-state'
import { buildSidebarHostOptions } from '../sidebar/sidebar-host-options'
import { getHostDisplayLabelOverrides } from '../../../../shared/host-setting-overrides'
import {
  getSettingsFocusedExecutionHostId,
  type ExecutionHostId
} from '../../../../shared/execution-host'
import { isMacUserAgent } from '@/components/terminal-pane/pane-helpers'
import { translate } from '@/i18n/i18n'
import { resolveAvailableBrowserSessionHostId } from './browser-session-host-selection'
export { getBrowserPaneCombinedSearchEntries }

type BrowserPaneProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
  onOpenComputerUse?: () => void | Promise<boolean>
}

export function BrowserPane({
  settings,
  updateSettings,
  onOpenComputerUse
}: BrowserPaneProps): React.JSX.Element {
  const searchQuery = useAppStore((s) => s.settingsSearchQuery)
  const browserDefaultUrl = useAppStore((s) => s.browserDefaultUrl)
  const setBrowserDefaultUrl = useAppStore((s) => s.setBrowserDefaultUrl)
  const browserDefaultSearchEngine = useAppStore((s) => s.browserDefaultSearchEngine)
  const setBrowserDefaultSearchEngine = useAppStore((s) => s.setBrowserDefaultSearchEngine)
  const browserDefaultZoomLevel = useAppStore((s) => s.browserDefaultZoomLevel)
  const setBrowserDefaultZoomLevel = useAppStore((s) => s.setBrowserDefaultZoomLevel)
  const browserSessionProfiles = useAppStore((s) => s.browserSessionProfiles)
  const repos = useAppStore((s) => s.repos)
  const sshTargetLabels = useAppStore((s) => s.sshTargetLabels)
  const sshConnectionStates = useAppStore((s) => s.sshConnectionStates)
  const runtimeEnvironments = useAppStore((s) => s.runtimeEnvironments)
  const runtimeStatusByEnvironmentId = useAppStore((s) => s.runtimeStatusByEnvironmentId)
  const browserSessionHostIdOverride = useAppStore((s) => s.browserSessionHostIdOverride)
  const setBrowserSessionHostId = useAppStore((s) => s.setBrowserSessionHostId)
  const detectedBrowsers = useAppStore((s) => s.detectedBrowsers)
  const browserSessionImportState = useAppStore((s) => s.browserSessionImportState)
  const defaultBrowserSessionProfileId = useAppStore((s) => s.defaultBrowserSessionProfileId)
  const setDefaultBrowserSessionProfileId = useAppStore((s) => s.setDefaultBrowserSessionProfileId)
  const defaultProfile = browserSessionProfiles.find((p) => p.id === 'default')
  const nonDefaultProfiles = browserSessionProfiles.filter((p) => p.scope !== 'default')
  const persistedHomePageDraft = browserDefaultUrl ?? ''
  const [homePageDraftState, setHomePageDraftState] = useState(() =>
    createBrowserHomePageDraftState(persistedHomePageDraft)
  )
  const [newProfileDialogOpen, setNewProfileDialogOpen] = useState(false)
  const {
    setBrowserPaneRootNode,
    scrollToSessionCookies,
    requestSessionCookieScroll,
    cookiesScrolled
  } = useBrowserCookieSectionScroll()
  const resolvedHomePageDraftState = resolveBrowserHomePageDraftState(
    homePageDraftState,
    persistedHomePageDraft
  )

  if (resolvedHomePageDraftState !== homePageDraftState) {
    setHomePageDraftState(resolvedHomePageDraftState)
  }
  const homePageDraft = resolvedHomePageDraftState.value
  const setHomePageDraft = (value: string): void => {
    setHomePageDraftState((current) => ({ ...current, value }))
  }

  const selectedSearchEngine = browserDefaultSearchEngine ?? 'google'

  const browserSearchEntries = getBrowserPaneSearchEntries()
  const showHomePage = matchesSettingsSearch(searchQuery, [browserSearchEntries[0]])
  const showSearchEngine = matchesSettingsSearch(searchQuery, [browserSearchEntries[1]])
  const showDefaultZoom = matchesSettingsSearch(searchQuery, [browserSearchEntries[2]])
  const showLinkRouting = matchesSettingsSearch(searchQuery, [browserSearchEntries[3]])
  const showLinkRoutingModifier = matchesSettingsSearch(searchQuery, [browserSearchEntries[4]])
  const showTerminalLinkActions = matchesSettingsSearch(searchQuery, [browserSearchEntries[5]])
  const showLocalhostLabels = matchesSettingsSearch(searchQuery, [browserSearchEntries[6]])
  const showCookies = matchesSettingsSearch(searchQuery, [browserSearchEntries[7]])
  const showClientHostedRemote = matchesSettingsSearch(searchQuery, [browserSearchEntries[8]])
  const showSshWorkspaceRouting = matchesSettingsSearch(searchQuery, [browserSearchEntries[9]])
  const showUserAgent = matchesSettingsSearch(searchQuery, [browserSearchEntries[10]])
  const showBrowserUse = matchesSettingsSearch(searchQuery, getBrowserUsePaneSearchEntries())
  const isMac = isMacUserAgent()
  const linkRoutingDescription = getBrowserLinkRoutingDescription(
    { isMac },
    settings.openLinksInAppModifierInverts === true
  )
  const hostLabelOverrides = useMemo(() => getHostDisplayLabelOverrides(settings), [settings])
  const browserSessionHostOptions = useMemo(
    () =>
      buildSidebarHostOptions({
        repos,
        sshTargetLabels,
        sshConnectionStates,
        settings,
        runtimeEnvironments,
        runtimeStatusByEnvironmentId,
        hostLabelOverrides
      })
        .filter((host) => host.kind === 'local' || host.kind === 'runtime')
        .map((host) => ({
          id: host.id,
          label: host.label,
          detail:
            host.kind === 'local'
              ? translate('auto.components.settings.BrowserPane.86b7c83fee', 'This computer')
              : translate(
                  'auto.components.settings.BrowserPane.c0f85056d9',
                  'Browser profiles on this Orca server.'
                )
        })),
    [
      repos,
      sshTargetLabels,
      sshConnectionStates,
      settings,
      runtimeEnvironments,
      runtimeStatusByEnvironmentId,
      hostLabelOverrides
    ]
  )
  const settingsFocusedHostId = getSettingsFocusedExecutionHostId(settings)
  const selectedBrowserSessionHostId = resolveAvailableBrowserSessionHostId(
    browserSessionHostOptions,
    browserSessionHostIdOverride,
    settingsFocusedHostId
  )
  useEffect(() => {
    const requestedHostId = browserSessionHostIdOverride ?? settingsFocusedHostId
    if (selectedBrowserSessionHostId !== requestedHostId) {
      void setBrowserSessionHostId(selectedBrowserSessionHostId)
    }
  }, [
    browserSessionHostIdOverride,
    selectedBrowserSessionHostId,
    setBrowserSessionHostId,
    settingsFocusedHostId
  ])
  const selectBrowserSessionHost = useCallback(
    (hostId: ExecutionHostId) => {
      void setBrowserSessionHostId(hostId)
    },
    [setBrowserSessionHostId]
  )

  useBrowserSettingsRequest({
    accepts: (command) =>
      [
        'status',
        'homepage-draft',
        'search-engine',
        'zoom',
        'profile-dialog-open',
        'cookies-scroll',
        'computer-use-open',
        'host-select',
        'profile-select'
      ].includes(command.action),
    apply: async (command, expiresAt) => {
      if (command.action === 'homepage-draft') {
        setHomePageDraft(command.value)
      } else if (command.action === 'search-engine') {
        setBrowserDefaultSearchEngine(command.engine === 'google' ? null : command.engine)
      } else if (command.action === 'zoom') {
        setBrowserDefaultZoomLevel(command.value)
      } else if (command.action === 'profile-dialog-open') {
        setNewProfileDialogOpen(true)
      } else if (command.action === 'cookies-scroll') {
        if (!(await requestSessionCookieScroll(expiresAt))) {
          throw new Error('browser_cookie_section_scroll_unavailable')
        }
      } else if (command.action === 'computer-use-open') {
        if (!onOpenComputerUse) {
          throw new Error('computer_use_navigation_unavailable')
        }
        if ((await onOpenComputerUse()) !== true) {
          throw new Error('computer_use_navigation_not_acknowledged')
        }
      } else if (command.action === 'host-select') {
        const host = browserSessionHostOptions.find((value) => value.id === command.hostId)
        if (!host) {
          throw new Error('browser_settings_host_unavailable')
        }
        await setBrowserSessionHostId(host.id)
      } else if (command.action === 'profile-select') {
        if (
          command.profileId !== null &&
          !nonDefaultProfiles.some((value) => value.id === command.profileId)
        ) {
          throw new Error('browser_settings_profile_unavailable')
        }
        setDefaultBrowserSessionProfileId(command.profileId)
      }
    },
    read: () => ({
      hostId: selectedBrowserSessionHostId,
      defaultProfileId: defaultBrowserSessionProfileId,
      homePageDraftPresent: homePageDraft.length > 0,
      homePageDraftSaved: homePageDraft === persistedHomePageDraft,
      dialogOpen: newProfileDialogOpen,
      cookiesScrolled
    })
  })

  return (
    <div ref={setBrowserPaneRootNode} data-browser-settings-pane className="space-y-6">
      {showBrowserUse ? (
        <BrowserUseSetup
          onConfigureMoreBrowsers={scrollToSessionCookies}
          onOpenComputerUse={onOpenComputerUse}
        />
      ) : null}

      {showHomePage ? (
        <BrowserHomePageSetting
          hostId={selectedBrowserSessionHostId}
          saved={homePageDraft === persistedHomePageDraft}
          value={homePageDraft}
          onChange={setHomePageDraft}
          onSave={(url) => {
            setBrowserDefaultUrl(url)
            setHomePageDraftState(createBrowserHomePageDraftState(url ?? ''))
          }}
        />
      ) : null}

      {showSearchEngine ? (
        <BrowserSearchEngineSetting
          selectedSearchEngine={selectedSearchEngine}
          onSearchEngineChange={(engine) => {
            setBrowserDefaultSearchEngine(engine === 'google' ? null : engine)
          }}
        />
      ) : null}

      {showDefaultZoom ? (
        <BrowserDefaultZoomSetting
          value={browserDefaultZoomLevel}
          onChange={setBrowserDefaultZoomLevel}
        />
      ) : null}

      {showUserAgent ? <BrowserUserAgentSetting hostId={settingsFocusedHostId} /> : null}

      {showLinkRouting ? (
        <BrowserLinkRoutingSetting
          settings={settings}
          linkRoutingDescription={linkRoutingDescription}
          isMac={isMac}
          updateSettings={updateSettings}
        />
      ) : null}

      {showLinkRoutingModifier ? (
        <BrowserLinkRoutingModifierSetting
          settings={settings}
          isMac={isMac}
          updateSettings={updateSettings}
        />
      ) : null}

      {showTerminalLinkActions ? (
        <BrowserTerminalLinkActionsSetting
          settings={settings}
          isMac={isMac}
          updateSettings={updateSettings}
        />
      ) : null}

      {showLocalhostLabels ? (
        <BrowserLocalhostWorktreeLabelsSetting
          settings={settings}
          updateSettings={updateSettings}
        />
      ) : null}

      {showClientHostedRemote || showSshWorkspaceRouting ? (
        <SettingsSubsectionHeader
          className="pt-2"
          title={translate('settings.browser.remoteBrowsing.heading', 'Remote browsing')}
          description={translate(
            'settings.browser.remoteBrowsing.headingDescription',
            'Where remote workspace pages render, and where their network traffic leaves from.'
          )}
        />
      ) : null}

      {showClientHostedRemote ? (
        <BrowserClientHostedRemoteSetting settings={settings} updateSettings={updateSettings} />
      ) : null}

      {showSshWorkspaceRouting ? (
        <BrowserSshWorkspaceRoutingSetting settings={settings} updateSettings={updateSettings} />
      ) : null}

      {showCookies ? (
        <BrowserSessionCookiesSection
          defaultProfile={defaultProfile}
          nonDefaultProfiles={nonDefaultProfiles}
          detectedBrowsers={detectedBrowsers}
          importState={browserSessionImportState}
          defaultBrowserSessionProfileId={defaultBrowserSessionProfileId}
          hostOptions={browserSessionHostOptions}
          selectedHostId={selectedBrowserSessionHostId}
          onAddProfile={() => setNewProfileDialogOpen(true)}
          onSelectHost={selectBrowserSessionHost}
          onSelectDefaultProfile={() => setDefaultBrowserSessionProfileId(null)}
          onSelectProfile={setDefaultBrowserSessionProfileId}
        />
      ) : null}

      <BrowserNewProfileDialog
        hostId={selectedBrowserSessionHostId}
        open={newProfileDialogOpen}
        onOpenChange={setNewProfileDialogOpen}
      />
    </div>
  )
}
