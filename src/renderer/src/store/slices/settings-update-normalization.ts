import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { normalizeNativeChatAppearanceSettings } from '../../../../shared/native-chat-appearance-settings'
import { normalizeTerminalQuickCommands } from '../../../../shared/terminal-quick-commands'
import { normalizeTerminalCustomThemes } from '../../../../shared/terminal-custom-themes'
import { normalizeTaskProviderSettings } from '../../../../shared/task-providers'
import { normalizeOpenInApplications } from '../../../../shared/open-in-applications'
import { normalizeDisabledTuiAgents } from '../../../../shared/tui-agent-selection'
import { normalizeUiLanguage } from '../../../../shared/ui-language'
import { normalizeDesktopTerminalScrollbackRows } from '../../../../shared/terminal-scrollback-policy'
import { createBrowserUuid } from '@/lib/browser-uuid'
import {
  normalizeTuiAgentArgsRecord,
  normalizeTuiAgentEnvRecord
} from '../../../../shared/tui-agent-launch-defaults'
import {
  normalizeMobilePairingCustomAddress,
  normalizeMobilePairingCustomAddresses
} from '../../../../shared/mobile-pairing-custom-address'

type LegacyTerminalScrollbackSettingsUpdate = Partial<GlobalSettings> & {
  terminalScrollbackBytes?: unknown
}

export function normalizeSettingsUpdates(
  updates: Partial<GlobalSettings>,
  currentSettings: GlobalSettings | null
): Partial<GlobalSettings> {
  const { terminalScrollbackBytes: _legacyScrollbackBytes, ...sanitizedUpdates } =
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the legacy field is only discarded; persisted fields retain GlobalSettings types.
    updates as LegacyTerminalScrollbackSettingsUpdate
  void _legacyScrollbackBytes
  if ('terminalQuickCommands' in updates) {
    sanitizedUpdates.terminalQuickCommands = normalizeTerminalQuickCommands(
      updates.terminalQuickCommands
    )
  }
  if ('terminalCustomThemes' in updates) {
    sanitizedUpdates.terminalCustomThemes = normalizeTerminalCustomThemes(
      updates.terminalCustomThemes
    )
  }
  if ('visibleTaskProviders' in updates || 'defaultTaskSource' in updates) {
    const taskProviderSettings = normalizeTaskProviderSettings({
      visibleTaskProviders:
        'visibleTaskProviders' in updates
          ? updates.visibleTaskProviders
          : currentSettings?.visibleTaskProviders,
      defaultTaskSource:
        'defaultTaskSource' in updates
          ? updates.defaultTaskSource
          : currentSettings?.defaultTaskSource
    })
    sanitizedUpdates.defaultTaskSource = taskProviderSettings.defaultTaskSource
    sanitizedUpdates.visibleTaskProviders = taskProviderSettings.visibleTaskProviders
  }
  if ('openInApplications' in updates) {
    sanitizedUpdates.openInApplications = normalizeOpenInApplications(updates.openInApplications, {
      createId: createBrowserUuid
    })
  }
  if ('nativeChatAppearance' in updates) {
    sanitizedUpdates.nativeChatAppearance = normalizeNativeChatAppearanceSettings(
      updates.nativeChatAppearance
    )
  }
  if ('disabledTuiAgents' in updates) {
    sanitizedUpdates.disabledTuiAgents = normalizeDisabledTuiAgents(updates.disabledTuiAgents)
  }
  if ('agentDefaultArgs' in updates) {
    sanitizedUpdates.agentDefaultArgs = normalizeTuiAgentArgsRecord(updates.agentDefaultArgs)
    sanitizedUpdates.agentYoloDefaultsMigrated = true
  }
  if ('agentDefaultEnv' in updates) {
    sanitizedUpdates.agentDefaultEnv = normalizeTuiAgentEnvRecord(updates.agentDefaultEnv)
    sanitizedUpdates.agentYoloDefaultsMigrated = true
  }
  if ('uiLanguage' in updates) {
    sanitizedUpdates.uiLanguage = normalizeUiLanguage(updates.uiLanguage)
  }
  if ('terminalScrollbackRows' in updates) {
    sanitizedUpdates.terminalScrollbackRows = normalizeDesktopTerminalScrollbackRows(
      updates.terminalScrollbackRows
    )
  }
  if ('mobilePairingCustomAddress' in updates) {
    sanitizedUpdates.mobilePairingCustomAddress = normalizeMobilePairingCustomAddress(
      updates.mobilePairingCustomAddress
    )
  }
  if ('mobilePairingCustomAddresses' in updates) {
    sanitizedUpdates.mobilePairingCustomAddresses = normalizeMobilePairingCustomAddresses(
      updates.mobilePairingCustomAddresses
    )
  }
  return sanitizedUpdates
}
