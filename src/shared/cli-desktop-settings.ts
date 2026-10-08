import { openEnum } from './zod-salvage'
import { z } from 'zod'
import { CliDesktopSettingsFields } from './cli-desktop-settings-update'
export { CliDesktopSettingsUpdate } from './cli-desktop-settings-update'

const CliDesktopSettingsRead = CliDesktopSettingsFields.omit({
  httpProxyUrl: true,
  opencodeSessionCookie: true,
  agentCmdOverrides: true,
  agentDefaultArgs: true,
  agentDefaultEnv: true,
  terminalDefaultShellArgs: true,
  terminalQuickCommands: true,
  openInApplications: true,
  commitMessageAi: true,
  sourceControlAi: true,
  nativeChatSessionOptions: true
})
  .extend({
    branchPrefix: openEnum(
      CliDesktopSettingsFields.shape.branchPrefix.unwrap().options,
      undefined
    ).optional(),
    theme: openEnum(CliDesktopSettingsFields.shape.theme.unwrap().options, undefined).optional(),
    leftSidebarAppearanceMode: openEnum(
      CliDesktopSettingsFields.shape.leftSidebarAppearanceMode.unwrap().options,
      undefined
    ).optional(),
    appIcon: openEnum(
      CliDesktopSettingsFields.shape.appIcon.unwrap().options,
      undefined
    ).optional(),
    terminalGpuAcceleration: openEnum(
      CliDesktopSettingsFields.shape.terminalGpuAcceleration.unwrap().options,
      undefined
    ).optional(),
    terminalLigatures: openEnum(
      CliDesktopSettingsFields.shape.terminalLigatures.unwrap().options,
      undefined
    ).optional(),
    terminalCursorStyle: openEnum(
      CliDesktopSettingsFields.shape.terminalCursorStyle.unwrap().options,
      undefined
    ).optional(),
    localAccountRuntime: openEnum(
      CliDesktopSettingsFields.shape.localAccountRuntime.unwrap().options,
      undefined
    ).optional(),
    localAgentRuntime: openEnum(
      CliDesktopSettingsFields.shape.localAgentRuntime.unwrap().options,
      undefined
    ).optional(),
    terminalWindowsPowerShellImplementation: openEnum(
      CliDesktopSettingsFields.shape.terminalWindowsPowerShellImplementation.unwrap().options,
      undefined
    ).optional(),
    claudeAgentTeamsMode: openEnum(
      CliDesktopSettingsFields.shape.claudeAgentTeamsMode.unwrap().options,
      undefined
    ).optional(),
    setupScriptLaunchMode: openEnum(
      CliDesktopSettingsFields.shape.setupScriptLaunchMode.unwrap().options,
      undefined
    ).optional(),
    terminalLinkClickBehavior: openEnum(
      CliDesktopSettingsFields.shape.terminalLinkClickBehavior.unwrap().options,
      undefined
    ).optional(),
    terminalUrlMiddleClickBehavior: openEnum(
      CliDesktopSettingsFields.shape.terminalUrlMiddleClickBehavior.unwrap().options,
      undefined
    ).optional(),
    sourceControlViewMode: openEnum(
      CliDesktopSettingsFields.shape.sourceControlViewMode.unwrap().options,
      undefined
    ).optional(),
    sourceControlGroupOrder: openEnum(
      CliDesktopSettingsFields.shape.sourceControlGroupOrder.unwrap().options,
      undefined
    ).optional(),
    ctrlTabOrderMode: openEnum(
      CliDesktopSettingsFields.shape.ctrlTabOrderMode.unwrap().options,
      undefined
    ).optional(),
    terminalShortcutPolicy: openEnum(
      CliDesktopSettingsFields.shape.terminalShortcutPolicy.unwrap().options,
      undefined
    ).optional(),
    floatingTerminalTriggerLocation: openEnum(
      CliDesktopSettingsFields.shape.floatingTerminalTriggerLocation.unwrap().options,
      undefined
    ).optional(),
    diffDefaultView: openEnum(
      CliDesktopSettingsFields.shape.diffDefaultView.unwrap().options,
      undefined
    ).optional(),
    defaultTaskViewPreset: openEnum(
      CliDesktopSettingsFields.shape.defaultTaskViewPreset.unwrap().options,
      undefined
    ).optional(),
    defaultTaskSource: openEnum(
      CliDesktopSettingsFields.shape.defaultTaskSource.unwrap().options,
      undefined
    ).optional(),
    minimaxEndpoint: openEnum(
      CliDesktopSettingsFields.shape.minimaxEndpoint.unwrap().options,
      undefined
    ).optional(),
    zcodePlanSite: openEnum(
      CliDesktopSettingsFields.shape.zcodePlanSite.unwrap().options,
      undefined
    ).optional(),
    computerAwakeMode: openEnum(
      CliDesktopSettingsFields.shape.computerAwakeMode.unwrap().options,
      undefined
    ).optional(),
    terminalMacOptionAsAlt: openEnum(
      CliDesktopSettingsFields.shape.terminalMacOptionAsAlt.unwrap().options,
      undefined
    ).optional(),
    mobilePairingConnectionMode: openEnum(
      CliDesktopSettingsFields.shape.mobilePairingConnectionMode.unwrap().options,
      undefined
    ).optional(),
    experimentalAgentDashboardMode: openEnum(
      CliDesktopSettingsFields.shape.experimentalAgentDashboardMode.unwrap().options,
      undefined
    ).optional(),
    defaultTuiAgent: z.string().nullable().optional(),
    disabledTuiAgents: z.array(z.string()).optional()
  })
  .strip()

export function projectCliDesktopSettings(settings: unknown) {
  return CliDesktopSettingsRead.parse(settings)
}
