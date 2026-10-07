import { app, nativeTheme } from 'electron'
import type { Store } from '../persistence'
import type { GlobalSettings } from '../../shared/global-settings-types'
import { setMainUiLanguage } from '../i18n/main-i18n'
import { rebuildAppMenu } from '../menu/register-app-menu'
import { track } from '../telemetry/client'
import { SETTINGS_CHANGED_WHITELIST } from '../../shared/telemetry-events'
import type { AgentAwakeService } from '../agent-awake-service'
import { sanitizeFloatingWorkspaceDirectorySetting } from './floating-workspace-directory'
import { applyAgentStatusHooksEnabled } from '../agent-hooks/managed-agent-hook-controls'
import { isAgentStatusHooksEnabledForAgent } from '../../shared/agent-status-hooks-setting'
import { recordManagedHookInstallFailure } from '../agent-hooks/install-telemetry'
import { applyElectronProxySettings } from '../network/proxy-settings'
import { applyBrowserSessionProxies } from '../browser/browser-session-proxy'
import { browserSessionRegistry } from '../browser/browser-session-registry'
import { normalizeProxyBypassRules, normalizeProxyUrl } from '../../shared/network-proxy'
import { normalizeAppIconId } from '../../shared/app-icon'
import { normalizeUiLanguage } from '../../shared/ui-language'
import { applyAppIcon } from '../app-icon'
import { normalizeTerminalCustomThemes } from '../../shared/terminal-custom-themes'
import { normalizeDesktopTerminalScrollbackRows } from '../../shared/terminal-scrollback-policy'
import { normalizeTerminalLineHeight } from '../../shared/terminal-line-height-settings'
import { prepareLocalWorktreeRootsForRepos } from '../worktree-root-preparation'
import { scheduleCurrentWorktreeBaseDirectoryWatcherSync } from './worktree-base-directory-watcher'
import { haveSameDisabledTuiAgents } from '../../shared/tui-agent-selection'
import {
  normalizeMobilePairingCustomAddress,
  normalizeMobilePairingCustomAddresses
} from '../../shared/mobile-pairing-custom-address'
import {
  computerAwakeSettingsForMode,
  normalizeComputerAwakeMode
} from '../../shared/computer-awake-mode'
import { resolveAiVaultSearchSettings } from '../../shared/ai-vault-search-settings'
import { applySessionSearchSettingsChange } from '../ai-vault-search/session-search-enablement'

type LegacyTerminalScrollbackSettingsUpdate = Partial<GlobalSettings> & {
  terminalScrollbackBytes?: unknown
}

function sanitizeRendererSettingsUpdate(
  args: LegacyTerminalScrollbackSettingsUpdate
): Partial<GlobalSettings> {
  const { terminalScrollbackBytes: _legacyScrollbackBytes, ...sanitizedArgs } = args
  void _legacyScrollbackBytes
  delete sanitizedArgs.pluginConsents
  delete sanitizedArgs.disabledPlugins
  return sanitizedArgs
}

const APPEARANCE_MENU_KEYS: readonly (keyof GlobalSettings)[] = [
  'showTasksButton',
  'showAutomationsButton',
  'showMobileButton',
  'showTitlebarAppName'
]

export async function applyDesktopSettingsUpdate(
  store: Store,
  args: Partial<GlobalSettings>,
  agentAwakeService?: AgentAwakeService,
  originWebContentsId?: number
): Promise<GlobalSettings> {
  const sanitizedArgs = sanitizeRendererSettingsUpdate(args)
  delete sanitizedArgs.activeRuntimeEnvironmentId
  delete sanitizedArgs.floatingTerminalTrustedCwds
  if ('computerAwakeMode' in sanitizedArgs) {
    Object.assign(
      sanitizedArgs,
      computerAwakeSettingsForMode(
        normalizeComputerAwakeMode(
          sanitizedArgs.computerAwakeMode,
          sanitizedArgs.keepComputerAwakeWhileAgentsRun
        )
      )
    )
  } else if ('keepComputerAwakeWhileAgentsRun' in sanitizedArgs) {
    Object.assign(
      sanitizedArgs,
      computerAwakeSettingsForMode(sanitizedArgs.keepComputerAwakeWhileAgentsRun ? 'auto' : 'off')
    )
  }
  if (typeof args.floatingTerminalCwd === 'string') {
    sanitizedArgs.floatingTerminalCwd = await sanitizeFloatingWorkspaceDirectorySetting(
      store,
      args.floatingTerminalCwd
    )
  }
  if ('httpProxyUrl' in args) {
    const proxyUrl = normalizeProxyUrl(args.httpProxyUrl)
    sanitizedArgs.httpProxyUrl = proxyUrl.ok ? proxyUrl.value : ''
  }
  if ('httpProxyBypassRules' in args) {
    sanitizedArgs.httpProxyBypassRules = normalizeProxyBypassRules(args.httpProxyBypassRules)
  }
  if ('appIcon' in args) {
    sanitizedArgs.appIcon = normalizeAppIconId(args.appIcon)
  }
  if ('aiVaultSearch' in args) {
    sanitizedArgs.aiVaultSearch = resolveAiVaultSearchSettings(args)
  }
  if ('terminalCustomThemes' in args) {
    sanitizedArgs.terminalCustomThemes = normalizeTerminalCustomThemes(args.terminalCustomThemes)
  }
  if ('terminalScrollbackRows' in args) {
    sanitizedArgs.terminalScrollbackRows = normalizeDesktopTerminalScrollbackRows(
      args.terminalScrollbackRows
    )
  }
  if ('terminalLineHeight' in args) {
    sanitizedArgs.terminalLineHeight = normalizeTerminalLineHeight(args.terminalLineHeight)
  }
  if ('uiLanguage' in args) {
    sanitizedArgs.uiLanguage = normalizeUiLanguage(args.uiLanguage)
  }
  if ('mobilePairingCustomAddress' in args) {
    sanitizedArgs.mobilePairingCustomAddress = normalizeMobilePairingCustomAddress(
      args.mobilePairingCustomAddress
    )
  }
  if ('mobilePairingCustomAddresses' in args) {
    sanitizedArgs.mobilePairingCustomAddresses = normalizeMobilePairingCustomAddresses(
      args.mobilePairingCustomAddresses
    )
  }
  if (args.theme) {
    nativeTheme.themeSource = args.theme
  }
  const before = store.getSettings()
  const result = store.updateSettings(sanitizedArgs, {
    notifyListeners: true,
    originWebContentsId: originWebContentsId
  })
  const proxySettingsChanged =
    ('httpProxyUrl' in sanitizedArgs && before.httpProxyUrl !== result.httpProxyUrl) ||
    ('httpProxyBypassRules' in sanitizedArgs &&
      before.httpProxyBypassRules !== result.httpProxyBypassRules)
  if (proxySettingsChanged) {
    const defaultSessionApply = applyElectronProxySettings(result)
    const browserSessionsApply = applyBrowserSessionProxies(
      browserSessionRegistry.listProfiles(),
      result
    )
    const [defaultSessionResult, browserSessionsResult] = await Promise.allSettled([
      defaultSessionApply,
      browserSessionsApply
    ])
    if (defaultSessionResult.status === 'rejected') {
      console.warn('[settings] failed to apply network proxy settings')
    }
    if (browserSessionsResult.status === 'rejected') {
      console.warn('[settings] failed to apply network proxy settings to browser sessions')
    }
  }
  if ('computerAwakeMode' in sanitizedArgs || 'keepComputerAwakeWhileAgentsRun' in sanitizedArgs) {
    agentAwakeService?.setMode(
      normalizeComputerAwakeMode(result.computerAwakeMode, result.keepComputerAwakeWhileAgentsRun)
    )
  }
  const hookSettingChanged =
    ('agentStatusHooksEnabled' in sanitizedArgs &&
      before.agentStatusHooksEnabled !== result.agentStatusHooksEnabled) ||
    ('disabledTuiAgents' in sanitizedArgs &&
      !haveSameDisabledTuiAgents(before.disabledTuiAgents, result.disabledTuiAgents))
  if (hookSettingChanged) {
    try {
      await applyAgentStatusHooksEnabled(result.agentStatusHooksEnabled, result, {
        userInitiated: true,
        shouldHydrateShellPath: app.isPackaged,
        onInstallError: recordManagedHookInstallFailure,
        shouldContinue: (agent) => isAgentStatusHooksEnabledForAgent(store.getSettings(), agent)
      })
    } catch (error) {
      console.warn('[settings] failed to reconcile managed agent hooks:', error)
    }
  }
  if ('uiLanguage' in sanitizedArgs && before.uiLanguage !== result.uiLanguage) {
    await setMainUiLanguage(result.uiLanguage)
    rebuildAppMenu()
  }
  if (
    ('workspaceDir' in sanitizedArgs && before.workspaceDir !== result.workspaceDir) ||
    ('nestWorkspaces' in sanitizedArgs && before.nestWorkspaces !== result.nestWorkspaces)
  ) {
    void prepareLocalWorktreeRootsForRepos(store)
    scheduleCurrentWorktreeBaseDirectoryWatcherSync()
  }
  if (APPEARANCE_MENU_KEYS.some((key) => key in sanitizedArgs)) {
    rebuildAppMenu()
  }
  if ('appIcon' in sanitizedArgs && before.appIcon !== result.appIcon) {
    applyAppIcon(result.appIcon)
  }
  if ('aiVaultSearch' in sanitizedArgs) {
    applySessionSearchSettingsChange(before, result)
  }

  for (const key of SETTINGS_CHANGED_WHITELIST) {
    if (!(key in sanitizedArgs)) {
      continue
    }
    const beforeValue = before[key]
    const afterValue = result[key]
    if (beforeValue === afterValue) {
      continue
    }
    if (typeof afterValue !== 'boolean') {
      continue
    }
    track('settings_changed', {
      setting_key: key,
      value_kind: 'bool'
    })
  }

  return result
}
