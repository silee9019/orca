import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { SearchableSetting } from './SearchableSetting'
import { SettingsSwitchRow } from './SettingsFormControls'
import { getFloatingSidebarEntry } from './appearance-sidebar-search'

export function FloatingSidebarSetting({
  settings,
  updateSettings
}: {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}): React.JSX.Element {
  const entry = getFloatingSidebarEntry()
  return (
    <SearchableSetting
      title={entry.title}
      description={entry.description}
      keywords={entry.keywords}
    >
      <SettingsSwitchRow
        label={entry.title}
        description={entry.description}
        checked={settings.floatingSidebar === true}
        onChange={() => updateSettings({ floatingSidebar: settings.floatingSidebar !== true })}
      />
    </SearchableSetting>
  )
}
