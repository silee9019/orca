import { useBrowserSettingsRequest } from './use-browser-settings-request'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { translate } from '@/i18n/i18n'
import { SearchableSetting } from './SearchableSetting'
import { SettingsSwitchRow } from './SettingsFormControls'

type BrowserLocalhostWorktreeLabelsSettingProps = {
  settings: Pick<GlobalSettings, 'localhostWorktreeLabelsEnabled'>
  updateSettings: (updates: Partial<GlobalSettings>) => void | Promise<void>
}

export function BrowserLocalhostWorktreeLabelsSetting({
  settings,
  updateSettings
}: BrowserLocalhostWorktreeLabelsSettingProps): React.JSX.Element {
  const title = translate(
    'auto.components.settings.BrowserLocalhostWorktreeLabelsSetting.8ac8c3ad19',
    'Localhost Worktree Labels'
  )
  const description = translate(
    'auto.components.settings.BrowserLocalhostWorktreeLabelsSetting.1db3c8b983',
    'Open workspace ports as worktree-specific Orca localhost URLs so browser tabs are easier to tell apart.'
  )

  const toggleLocalhostLabels = () =>
    updateSettings({
      localhostWorktreeLabelsEnabled: settings.localhostWorktreeLabelsEnabled !== true
    })
  useBrowserSettingsRequest({
    accepts: (command) =>
      command.action === 'browser-preference-set' &&
      command.preference.field === 'localhost-labels',
    apply: async (command) => {
      if (
        command.action === 'browser-preference-set' &&
        command.preference.field === 'localhost-labels'
      ) {
        if (command.preference.value !== (settings.localhostWorktreeLabelsEnabled === true)) {
          await toggleLocalhostLabels()
        }
      }
    },
    read: () => ({
      hostId: LOCAL_EXECUTION_HOST_ID,
      preference: {
        field: 'localhost-labels',
        value: settings.localhostWorktreeLabelsEnabled === true
      }
    }),
    verify: (command, state) =>
      command.action === 'browser-preference-set' &&
      state.preference?.field === command.preference.field &&
      state.preference.value === command.preference.value
  })

  return (
    <SearchableSetting
      title={title}
      description={description}
      keywords={['browser', 'localhost', 'ports', 'worktree', 'tabs', 'favicon', 'labels']}
    >
      <SettingsSwitchRow
        label={title}
        description={description}
        checked={settings.localhostWorktreeLabelsEnabled === true}
        onChange={toggleLocalhostLabels}
      />
    </SearchableSetting>
  )
}
