import { useBrowserSettingsRequest } from './use-browser-settings-request'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'
import { useRef } from 'react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { translate } from '@/i18n/i18n'
import { BROWSER_TERMINAL_LINK_ACTIONS_SETTINGS_TARGET_ID } from '@/lib/settings-navigation-types'
import { SearchableSetting } from './SearchableSetting'
import {
  SettingsRow,
  SettingsSegmentedControl,
  SettingsSubsectionHeader
} from './SettingsFormControls'
import { getTerminalLinkActionSearchKeywords } from './browser-search'
import {
  terminalLinkClickBehaviorFor,
  type TerminalLinkClickBehavior
} from '../terminal-pane/terminal-link-click-behavior'

type BrowserTerminalLinkActionsSettingProps = {
  settings: Pick<
    GlobalSettings,
    | 'terminalLinkActionPopoverEnabled'
    | 'terminalLinkClickBehavior'
    | 'terminalUrlMiddleClickBehavior'
  >
  isMac: boolean
  updateSettings: (updates: Partial<GlobalSettings>) => void | Promise<void>
}

export function BrowserTerminalLinkActionsSetting({
  settings,
  isMac,
  updateSettings
}: BrowserTerminalLinkActionsSettingProps): React.JSX.Element {
  const title = translate(
    'auto.components.settings.BrowserTerminalLinkActionsSetting.title',
    'Terminal URL clicks'
  )
  const description = translate(
    'auto.components.settings.BrowserTerminalLinkActionsSetting.descriptionV2',
    'Control clicks on detected URLs printed in terminal panes and chat transcripts.'
  )
  const behavior = terminalLinkClickBehaviorFor(settings)
  const plainClickLabel = translate(
    'auto.components.settings.BrowserTerminalLinkActionsSetting.plainClickLabel',
    'Plain click'
  )
  const plainClickDescription = translate(
    'auto.components.settings.BrowserTerminalLinkActionsSetting.plainClickDescription',
    'Choose whether a left-click shows actions, opens the URL, or leaves it to the terminal. Cmd/Ctrl-click always opens directly.'
  )
  const plainClickAriaLabel = translate(
    'auto.components.settings.BrowserTerminalLinkActionsSetting.plainClickAriaLabel',
    'Plain click URL behavior'
  )
  const middleClickLabel = translate(
    'auto.components.settings.BrowserTerminalLinkActionsSetting.middleClickLabel',
    'Middle click'
  )
  const middleClickDescription = translate(
    'auto.components.settings.BrowserTerminalLinkActionsSetting.middleClickDescription',
    'Choose what a mouse-wheel click does on a detected terminal URL.'
  )
  const middleClickAriaLabel = translate(
    'auto.components.settings.BrowserTerminalLinkActionsSetting.middleClickAriaLabel',
    'Middle click'
  )
  const actionsLabel = translate(
    'auto.components.settings.BrowserTerminalLinkActionsSetting.actionsLabel',
    'Actions'
  )
  const openUrlLabel = translate(
    'auto.components.settings.BrowserTerminalLinkActionsSetting.openUrlLabel',
    'Open URL'
  )
  const leaveToTerminalLabel = translate(
    'auto.components.settings.BrowserTerminalLinkActionsSetting.leaveToTerminalLabel',
    'Leave to terminal'
  )

  const setPlainClick = (value: TerminalLinkClickBehavior) =>
    updateSettings({ terminalLinkClickBehavior: value })
  const setMiddleClick = (value: TerminalLinkClickBehavior) =>
    updateSettings({ terminalUrlMiddleClickBehavior: value })
  const preferenceField = useRef<'terminal-url-click' | 'terminal-url-middle-click'>(
    'terminal-url-click'
  )
  useBrowserSettingsRequest({
    accepts: (command) =>
      command.action === 'browser-preference-set' &&
      (command.preference.field === 'terminal-url-click' ||
        command.preference.field === 'terminal-url-middle-click'),
    apply: async (command) => {
      if (command.action !== 'browser-preference-set') {
        return
      }
      if (command.preference.field === 'terminal-url-click') {
        preferenceField.current = command.preference.field
        await setPlainClick(command.preference.value)
      } else if (command.preference.field === 'terminal-url-middle-click') {
        preferenceField.current = command.preference.field
        await setMiddleClick(command.preference.value)
      }
    },
    read: () => ({
      hostId: LOCAL_EXECUTION_HOST_ID,
      preference:
        preferenceField.current === 'terminal-url-click'
          ? { field: 'terminal-url-click', value: behavior }
          : {
              field: 'terminal-url-middle-click',
              value: settings.terminalUrlMiddleClickBehavior ?? 'open'
            }
    }),
    verify: (command, state) =>
      command.action === 'browser-preference-set' &&
      state.preference?.field === command.preference.field &&
      state.preference.value === command.preference.value
  })

  return (
    <SearchableSetting
      id={BROWSER_TERMINAL_LINK_ACTIONS_SETTINGS_TARGET_ID}
      title={title}
      description={description}
      keywords={getTerminalLinkActionSearchKeywords({ isMac })}
    >
      <section className="space-y-3">
        <SettingsSubsectionHeader title={title} description={description} />
        <div className="rounded-lg border border-border/60 bg-muted/10 px-4">
          <div className="divide-y divide-border/40">
            <SettingsRow
              label={plainClickLabel}
              description={plainClickDescription}
              alignTop
              control={
                <SettingsSegmentedControl<TerminalLinkClickBehavior>
                  value={behavior}
                  onChange={setPlainClick}
                  ariaLabel={plainClickAriaLabel}
                  size="sm"
                  options={[
                    { value: 'actions', label: actionsLabel },
                    { value: 'open', label: openUrlLabel },
                    { value: 'none', label: leaveToTerminalLabel }
                  ]}
                />
              }
            />
            <SettingsRow
              label={middleClickLabel}
              description={middleClickDescription}
              control={
                <SettingsSegmentedControl<TerminalLinkClickBehavior>
                  value={settings.terminalUrlMiddleClickBehavior ?? 'open'}
                  onChange={setMiddleClick}
                  ariaLabel={middleClickAriaLabel}
                  size="sm"
                  options={[
                    { value: 'actions', label: actionsLabel },
                    { value: 'open', label: openUrlLabel },
                    { value: 'none', label: leaveToTerminalLabel }
                  ]}
                />
              }
            />
          </div>
        </div>
      </section>
    </SearchableSetting>
  )
}
