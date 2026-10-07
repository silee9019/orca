import { useEffect, useRef, useState } from 'react'
import { useBrowserSettingsRequest } from './use-browser-settings-request'
import type {
  BrowserIdentityModeStatus,
  BrowserUserAgentMode
} from '../../../../shared/browser-user-agent-mode'
import { LOCAL_EXECUTION_HOST_ID, type ExecutionHostId } from '../../../../shared/execution-host'
import { BROWSER_USER_AGENT_SETTINGS_TARGET_ID } from '@/lib/settings-navigation-types'
import { translate } from '@/i18n/i18n'
import { SearchableSetting } from './SearchableSetting'
import { SettingsRow, SettingsSegmentedControl } from './SettingsFormControls'

type BrowserUserAgentSettingProps = {
  hostId: ExecutionHostId
}

export function BrowserUserAgentSetting({
  hostId
}: BrowserUserAgentSettingProps): React.JSX.Element {
  const [status, setStatus] = useState<BrowserIdentityModeStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const currentOwner = useRef({ hostId })
  if (currentOwner.current.hostId !== hostId) {
    currentOwner.current = { hostId }
  }
  const title = translate('settings.browser.userAgent.title', 'Browser identity')
  const description = translate(
    'settings.browser.userAgent.description',
    'Choose the user agent for every browser profile and page. Native mode disables Google sign-in. Changes take effect after a restart.'
  )
  const isLocal = hostId === LOCAL_EXECUTION_HOST_ID

  useEffect(() => {
    setStatus(null)
    setError(null)
    if (!isLocal) {
      return
    }
    let disposed = false
    void window.api.browser
      .identityGet()
      .then((nextStatus) => {
        if (!disposed) {
          setStatus(nextStatus)
        }
      })
      .catch((reason) => {
        if (!disposed) {
          setError(reason instanceof Error ? reason.message : String(reason))
        }
      })
    return () => {
      disposed = true
    }
  }, [isLocal])

  const setMode = async (mode: BrowserUserAgentMode): Promise<boolean> => {
    if (!isLocal || !status || status.identity.configuredMode === null || savingRef.current) {
      return false
    }
    const owner = currentOwner.current
    savingRef.current = true
    setSaving(true)
    setError(null)
    try {
      const result = await window.api.browser.identitySet(mode)
      if (currentOwner.current !== owner) {
        return false
      }
      if (!result) {
        setError(
          translate('settings.browser.userAgent.unavailable', 'Browser identity is unavailable.')
        )
        return false
      }
      if (!result.ok) {
        setError(result.error.message)
        return false
      }
      setStatus({ identity: result.identity, migrationNotice: null })
      return true
    } catch (reason) {
      if (currentOwner.current === owner) {
        setError(reason instanceof Error ? reason.message : String(reason))
      }
      return false
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }
  useBrowserSettingsRequest({
    accepts: (command) => command.action === 'browser-identity-set',
    apply: async (command) => {
      if (command.action === 'browser-identity-set' && !(await setMode(command.mode))) {
        throw new Error('browser_identity_owner_did_not_acknowledge')
      }
    },
    read: () => ({
      hostId,
      identityConfiguredMode: status?.identity.configuredMode ?? null,
      identityAppliedMode: status?.identity.appliedMode ?? null,
      identityRestartRequired: status?.identity.restartRequired ?? false,
      identitySaving: saving,
      identityErrorPresent: error !== null
    })
  })

  let control: React.JSX.Element
  if (!isLocal) {
    control = (
      <span className="text-xs text-muted-foreground">
        {translate(
          'settings.browser.userAgent.remoteUnsupported',
          'Manage browser identity on the remote host with the Orca CLI.'
        )}
      </span>
    )
  } else if (!status) {
    control = (
      <span className="text-xs text-muted-foreground">
        {error ?? translate('settings.browser.userAgent.loading', 'Loading…')}
      </span>
    )
  } else if (status.identity.configuredMode === null) {
    // Why the command is named here: this state deliberately exposes no reset control, because the
    // reset overwrites data that may belong to a newer Orca. Without naming the escape the message
    // tells the user their data must be reset and then offers no way to do it.
    control = (
      <div className="space-y-1 text-right">
        <div className="text-xs text-destructive">
          {translate(
            'settings.browser.userAgent.resetRequired',
            'Identity data must be reset explicitly before it can be changed.'
          )}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {translate(
            'settings.browser.userAgent.resetRequiredCommand',
            'Reset it from the command line: orca browser identity set --mode <mode> --reset'
          )}
        </div>
      </div>
    )
  } else {
    control = (
      <div className="space-y-1 text-right">
        <SettingsSegmentedControl<BrowserUserAgentMode>
          size="sm"
          ariaLabel={title}
          value={status.identity.configuredMode}
          onChange={setMode}
          options={[
            {
              value: 'clean',
              disabled: saving,
              label: translate('settings.browser.userAgent.optionClean', 'Cleaned'),
              tooltip: translate(
                'settings.browser.userAgent.optionCleanTooltip',
                'Removes Orca and Electron tokens to match imported Chrome sessions.'
              )
            },
            {
              value: 'native',
              disabled: saving,
              label: translate('settings.browser.userAgent.optionNative', 'Native'),
              tooltip: translate(
                'settings.browser.userAgent.optionNativeTooltip',
                "Keeps Electron's built-in identity for sites that reject the cleaned identity. Google sign-in is unavailable in Native mode."
              )
            }
          ]}
        />
        {status.identity.restartRequired ? (
          <div className="text-[11px] text-muted-foreground">
            {translate('settings.browser.userAgent.restartRequired', 'Restart required')}
          </div>
        ) : null}
        {error ? <div className="text-[11px] text-destructive">{error}</div> : null}
      </div>
    )
  }

  return (
    <SearchableSetting
      id={BROWSER_USER_AGENT_SETTINGS_TARGET_ID}
      title={title}
      description={description}
      keywords={['browser', 'identity', 'user agent', 'native', 'cleaned', 'restart']}
    >
      <SettingsRow label={title} description={description} control={control} />
    </SearchableSetting>
  )
}
