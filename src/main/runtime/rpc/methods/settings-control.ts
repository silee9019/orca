import {
  SettingsPreflightContext,
  SettingsPreflightCheck,
  SettingsPreflightOutput,
  SettingsAgentsOutput,
  SettingsRefreshOutput
} from '../../../../shared/cli-settings-preflight'
import {
  runPreflightCheck,
  detectInstalledAgentsWithShellPathHydration,
  refreshShellPathAndDetectAgents
} from '../../../preflight/agent-detection'

function requireSettingsPreflightHost(context: { wslDistro?: string; wslDefault?: boolean }) {
  if ((context.wslDistro || context.wslDefault) && process.platform !== 'win32') {
    throw new InvalidArgumentError('WSL preflight requires a Windows runtime.')
  }
  return context
}
import { defineMethod, InvalidArgumentError } from '../core'
import { CliSettingsUpdate, projectCliSettings } from '../../../../shared/cli-runtime-settings'
import { PRBotAuthorOverrideUpdate } from '../../../../shared/rpc-contract/client-settings-params'
import {
  SettingsWarpImportSource,
  SettingsKeybindingUpdate
} from '../../../../shared/rpc-contract/settings-control-params'
import { readZCodeInteractiveCapability } from '../../../zcode/interactive-capability'
import { CliDesktopSettingsUpdate } from '../../../../shared/cli-desktop-settings'

export const SETTINGS_CONTROL_METHODS = [
  defineMethod({
    name: 'settings.control.previewGhosttyImport',
    params: null,
    handler: async (_params, { runtime }) => runtime.previewSettingsGhosttyImport()
  }),
  defineMethod({
    name: 'settings.control.previewWarpThemes',
    params: SettingsWarpImportSource,
    handler: async (params, { runtime }) => runtime.previewSettingsWarpThemes(params)
  }),
  defineMethod({
    name: 'settings.control.preflightCheck',
    params: SettingsPreflightCheck,
    handler: async (params) =>
      SettingsPreflightOutput.parse(
        await runPreflightCheck(params.force, requireSettingsPreflightHost(params))
      )
  }),
  defineMethod({
    name: 'settings.control.detectAgents',
    params: SettingsPreflightContext,
    handler: async (params) =>
      SettingsAgentsOutput.parse(
        await detectInstalledAgentsWithShellPathHydration(requireSettingsPreflightHost(params))
      )
  }),
  defineMethod({
    name: 'settings.control.refreshAgents',
    params: SettingsPreflightContext,
    handler: async (params) =>
      SettingsRefreshOutput.parse(
        await refreshShellPathAndDetectAgents(requireSettingsPreflightHost(params))
      )
  }),
  defineMethod({
    name: 'settings.desktop.get',
    params: null,
    handler: (_params, { runtime }) => ({ settings: runtime.getDesktopControlSettings() })
  }),
  defineMethod({
    name: 'settings.desktop.update',
    params: CliDesktopSettingsUpdate,
    handler: async (params, { runtime }) => ({
      settings: await runtime.updateDesktopControlSettings(params),
      persisted: true,
      rendered: false
    })
  }),
  defineMethod({
    name: 'settings.control.listFonts',
    params: null,
    handler: async (_params, { runtime }) => ({ fonts: await runtime.listSettingsFonts() })
  }),
  defineMethod({
    name: 'keybindings.get',
    params: null,
    handler: (_params, { runtime }) => ({ keybindings: runtime.getSettingsKeybindings() })
  }),
  defineMethod({
    name: 'keybindings.reload',
    params: null,
    handler: (_params, { runtime }) => ({ keybindings: runtime.reloadSettingsKeybindings() })
  }),
  defineMethod({
    name: 'keybindings.setAction',
    params: SettingsKeybindingUpdate,
    handler: (params, { runtime }) => ({
      keybindings: runtime.setSettingsKeybinding(params.actionId, params.bindings)
    })
  }),
  defineMethod({
    name: 'preflight.zcodeInteractiveCapability',
    params: null,
    handler: async () => ({ capability: await readZCodeInteractiveCapability() })
  }),
  defineMethod({
    name: 'settings.control.get',
    params: null,
    handler: (_params, { runtime }) => ({
      settings: projectCliSettings(runtime.getClientSettings())
    })
  }),
  defineMethod({
    name: 'settings.control.update',
    params: CliSettingsUpdate,
    handler: async (params, { runtime }) => ({
      settings: projectCliSettings(await runtime.updateClientSettings(params))
    })
  }),
  defineMethod({
    name: 'settings.control.updatePRBotAuthorOverride',
    params: PRBotAuthorOverrideUpdate,
    handler: (params, { runtime }) => ({
      settings: projectCliSettings(runtime.updateClientPRBotAuthorOverride(params))
    })
  })
]
