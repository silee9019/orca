import { useMobileNavigationViewer } from '@/runtime/mobile-navigation-viewer'
import { getInstallCopy } from '../mobile/mobile-platform-copy'
import { SearchableSetting } from './SearchableSetting'
import { SettingsSwitchRow } from './SettingsFormControls'
import { MobilePane } from './MobilePane'
import {
  getMobileOverviewSearchEntry,
  getMobileSidebarShortcutSearchEntry,
  getMobileSettingsPaneSearchEntries
} from './mobile-settings-search'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { MobileRelayBetaNotice } from './MobileRelayBetaNotice'
export { getMobileSettingsPaneSearchEntries }

const ORCA_IOS_APP_STORE_URL = getInstallCopy('ios', 'stable').url
const ORCA_ANDROID_APK_URL = getInstallCopy('android', 'stable').url

export function MobileSettingsPane(): React.JSX.Element {
  const showMobileButton = useAppStore((s) => s.settings?.showMobileButton !== false)
  const updateSettings = useAppStore((s) => s.updateSettings)

  useMobileNavigationViewer({
    surface: 'settings',
    read: () => ({ showButton: showMobileButton, badgeVisible: false }),
    visibility: async (shown) => {
      await updateSettings({ showMobileButton: shown })
      return true
    },
    openInstall: async (platform) => {
      await window.api.shell.openUrl(
        platform === 'ios' ? ORCA_IOS_APP_STORE_URL : ORCA_ANDROID_APK_URL
      )
      return true
    },
    persisted: async (kind, shown) =>
      kind === 'visibility' &&
      ((await window.api.settings.get()).showMobileButton !== false) === shown
  })
  return (
    <div className="space-y-4">
      <SearchableSetting
        title={translate('auto.components.settings.MobileSettingsPane.e7a3ae8c4e', 'Mobile')}
        description={translate(
          'auto.components.settings.MobileSettingsPane.174f4a3c6d',
          'Control terminals and agents from your phone.'
        )}
        keywords={getMobileOverviewSearchEntry().keywords}
        className="space-y-3 py-2"
      >
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>
            {translate(
              'auto.components.settings.MobileSettingsPane.installIntro',
              'Install Orca Mobile from the'
            )}{' '}
            <button
              type="button"
              onClick={() => void window.api.shell.openUrl(ORCA_IOS_APP_STORE_URL)}
              className="cursor-pointer underline underline-offset-2 hover:text-foreground"
            >
              {translate('auto.components.settings.MobileSettingsPane.b5a2ed83ff', 'App Store')}
            </button>
            {' · '}
            <button
              type="button"
              // Why: Android is moving to Google Play soon, but until then
              // link directly to the pinned APK asset for the current mobile release.
              onClick={() => void window.api.shell.openUrl(ORCA_ANDROID_APK_URL)}
              className="cursor-pointer underline underline-offset-2 hover:text-foreground"
            >
              {translate(
                'auto.components.settings.MobileSettingsPane.androidApkLabel',
                'Android APK'
              )}
            </button>
            {translate(
              'auto.components.settings.MobileSettingsPane.installOutro',
              ', then pair below.'
            )}
          </p>
          <MobileRelayBetaNotice />
        </div>
      </SearchableSetting>

      <SearchableSetting
        title={translate(
          'auto.components.settings.MobileSettingsPane.1de96ec8a6',
          'Show Orca Mobile Button'
        )}
        description={translate(
          'auto.components.settings.MobileSettingsPane.682293cadf',
          'Show the Orca Mobile button at the top of the left sidebar.'
        )}
        keywords={getMobileSidebarShortcutSearchEntry().keywords}
      >
        {/* Why: the in-page removal toast points users to Settings > Mobile. */}
        <SettingsSwitchRow
          label={translate(
            'auto.components.settings.MobileSettingsPane.1de96ec8a6',
            'Show Orca Mobile Button'
          )}
          description={translate(
            'auto.components.settings.MobileSettingsPane.d4f2b65f30',
            'Show the Orca Mobile shortcut in the sidebar.'
          )}
          checked={showMobileButton}
          onChange={() => updateSettings({ showMobileButton: !showMobileButton })}
        />
      </SearchableSetting>

      <div className="rounded-xl border border-border/60 bg-card/50 p-4">
        <MobilePane />
      </div>
    </div>
  )
}
