import { useAppStore } from '../store'
import { USAGE_PERCENTAGE_DISPLAY_SETTING_ID } from '../components/settings/appearance-usage-percentage-search'

export function openUsagePercentageSettings(): void {
  const store = useAppStore.getState()
  store.openSettingsPage()
  store.openSettingsTarget({
    pane: 'appearance',
    repoId: null,
    sectionId: USAGE_PERCENTAGE_DISPLAY_SETTING_ID
  })
}
