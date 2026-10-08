import { useBrowserSettingsRequest } from './use-browser-settings-request'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'
import { useRef } from 'react'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { BROWSER_SSH_WORKSPACE_ROUTING_SETTINGS_TARGET_ID } from '@/lib/settings-navigation-types'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { SearchableSetting } from './SearchableSetting'
import { SettingsRow, SettingsSegmentedControl } from './SettingsFormControls'
import {
  getBrowserSshWorkspaceRoutingDescription,
  getBrowserSshWorkspaceRoutingTitle
} from './browser-ssh-workspace-routing-copy'

type BrowserSshWorkspaceRoutingSettingProps = {
  settings: Pick<
    GlobalSettings,
    'browserSshWorkspaceRoutingEnabled' | 'browserSshWorkspaceRoutingDisabledTargetIds'
  >
  updateSettings: (updates: Partial<GlobalSettings>) => void | Promise<void>
}

export function BrowserSshWorkspaceRoutingSetting({
  settings,
  updateSettings
}: BrowserSshWorkspaceRoutingSettingProps): React.JSX.Element {
  const title = getBrowserSshWorkspaceRoutingTitle()
  const description = getBrowserSshWorkspaceRoutingDescription()
  const sshTargetLabels = useAppStore((s) => s.sshTargetLabels)
  const disabledTargetIds = settings.browserSshWorkspaceRoutingDisabledTargetIds ?? []

  const restoredTarget = useRef<string | null>(null)
  const setSshRouting = (value: string) =>
    updateSettings({ browserSshWorkspaceRoutingEnabled: value === 'host' })
  const restoreSshTarget = (targetId: string) =>
    updateSettings({
      browserSshWorkspaceRoutingDisabledTargetIds: disabledTargetIds.filter((id) => id !== targetId)
    })
  useBrowserSettingsRequest({
    accepts: (command) =>
      command.action === 'browser-ssh-route-restore' ||
      (command.action === 'browser-preference-set' && command.preference.field === 'ssh-routing'),
    apply: async (command) => {
      if (command.action === 'browser-ssh-route-restore') {
        if (!disabledTargetIds.includes(command.targetId)) {
          throw new Error('ssh_route_restore_target_unavailable')
        }
        restoredTarget.current = command.targetId
        await restoreSshTarget(command.targetId)
      } else if (
        command.action === 'browser-preference-set' &&
        command.preference.field === 'ssh-routing'
      ) {
        await setSshRouting(command.preference.value ? 'host' : 'device')
      }
    },
    read: () => ({
      hostId: LOCAL_EXECUTION_HOST_ID,
      preference: {
        field: 'ssh-routing',
        value: settings.browserSshWorkspaceRoutingEnabled !== false
      },
      sshDisabledTargetCount: disabledTargetIds.length,
      sshRestoredTargetId: restoredTarget.current ?? undefined,
      sshRouteRestored:
        restoredTarget.current === null
          ? undefined
          : !disabledTargetIds.includes(restoredTarget.current)
    }),
    verify: (command, state) =>
      command.action === 'browser-ssh-route-restore'
        ? state.sshRestoredTargetId === command.targetId && state.sshRouteRestored === true
        : command.action === 'browser-preference-set' &&
          state.preference?.field === command.preference.field &&
          state.preference.value === command.preference.value
  })

  return (
    <SearchableSetting
      id={BROWSER_SSH_WORKSPACE_ROUTING_SETTINGS_TARGET_ID}
      title={title}
      description={description}
      keywords={[
        'browser',
        'ssh',
        'remote',
        'proxy',
        'tunnel',
        'routing',
        'host',
        'network',
        'egress',
        'traffic'
      ]}
    >
      <SettingsRow
        label={title}
        description={description}
        control={
          <SettingsSegmentedControl
            size="sm"
            ariaLabel={title}
            // Why: absent means on — routed egress is the correct default for SSH workspaces.
            value={settings.browserSshWorkspaceRoutingEnabled !== false ? 'host' : 'device'}
            onChange={setSshRouting}
            options={[
              {
                value: 'host',
                label: translate('settings.browser.sshWorkspaceRouting.optionHost', 'SSH host'),
                tooltip: translate(
                  'settings.browser.sshWorkspaceRouting.optionHostTooltip',
                  "Traffic and DNS go through the workspace's SSH host."
                )
              },
              {
                value: 'device',
                label: translate(
                  'settings.browser.sshWorkspaceRouting.optionDevice',
                  'This device'
                ),
                tooltip: translate(
                  'settings.browser.sshWorkspaceRouting.optionDeviceTooltip',
                  "Pages browse from this machine's network."
                )
              }
            ]}
          />
        }
      />
      {disabledTargetIds.length > 0 ? (
        <div className="mt-2 flex flex-col gap-1.5">
          <div className="text-xs text-muted-foreground">
            {translate(
              'settings.browser.sshWorkspaceRouting.disabledHosts',
              'Hosts browsing from this device instead:'
            )}
          </div>
          {disabledTargetIds.map((targetId) => (
            <div key={targetId} className="flex items-center gap-2 text-xs text-foreground">
              <span className="min-w-0 truncate">{sshTargetLabels.get(targetId) ?? targetId}</span>
              <Button
                type="button"
                variant="link"
                size="xs"
                className="h-auto px-0"
                onClick={() => restoreSshTarget(targetId)}
              >
                {translate('settings.browser.sshWorkspaceRouting.useHost', 'Use SSH host')}
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </SearchableSetting>
  )
}
