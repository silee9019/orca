import { useBrowserSettingsRequest } from './use-browser-settings-request'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { SearchableSetting } from './SearchableSetting'
import { SettingsSwitchRow } from './SettingsFormControls'
import {
  getLinkRoutingModifierDescription,
  getLinkRoutingModifierTitle
} from './browser-link-routing-copy'

type BrowserLinkRoutingModifierSettingProps = {
  settings: Pick<GlobalSettings, 'openLinksInApp' | 'openLinksInAppModifierInverts'>
  isMac: boolean
  updateSettings: (updates: Partial<GlobalSettings>) => void | Promise<void>
}

export function BrowserLinkRoutingModifierSetting({
  settings,
  isMac,
  updateSettings
}: BrowserLinkRoutingModifierSettingProps): React.JSX.Element {
  const openLinksInApp = settings.openLinksInApp === true
  const title = getLinkRoutingModifierTitle(openLinksInApp)
  const description = getLinkRoutingModifierDescription({ openLinksInApp, isMac })

  const toggleModifier = () =>
    updateSettings({
      openLinksInAppModifierInverts: settings.openLinksInAppModifierInverts !== true
    })
  useBrowserSettingsRequest({
    accepts: (command) =>
      command.action === 'browser-preference-set' &&
      command.preference.field === 'link-routing-modifier',
    apply: async (command) => {
      if (
        command.action === 'browser-preference-set' &&
        command.preference.field === 'link-routing-modifier'
      ) {
        if (command.preference.value !== (settings.openLinksInAppModifierInverts === true)) {
          await toggleModifier()
        }
      }
    },
    read: () => ({
      hostId: LOCAL_EXECUTION_HOST_ID,
      preference: {
        field: 'link-routing-modifier',
        value: settings.openLinksInAppModifierInverts === true
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
      keywords={[
        'browser',
        'links',
        'routing',
        'shift',
        'modifier',
        'invert',
        'opposite',
        isMac ? 'cmd' : 'ctrl'
      ]}
    >
      {/* Nested under Link Routing: this row only describes what its modifier does. */}
      <div className="ml-4 border-l border-border pl-4">
        <SettingsSwitchRow
          label={title}
          description={description}
          checked={settings.openLinksInAppModifierInverts === true}
          onChange={toggleModifier}
        />
      </div>
    </SearchableSetting>
  )
}
