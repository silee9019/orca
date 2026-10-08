import { openEnum } from './zod-salvage'
import { z } from 'zod'
import { CliDesktopSettingsUpdate } from './cli-desktop-settings-update'
export { CliDesktopSettingsUpdate } from './cli-desktop-settings-update'

const CliDesktopSettingsRead = CliDesktopSettingsUpdate.omit({
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
      CliDesktopSettingsUpdate.shape.branchPrefix.unwrap().options,
      undefined
    ).optional(),
    theme: openEnum(CliDesktopSettingsUpdate.shape.theme.unwrap().options, undefined).optional(),
    leftSidebarAppearanceMode: openEnum(
      CliDesktopSettingsUpdate.shape.leftSidebarAppearanceMode.unwrap().options,
      undefined
    ).optional(),
    appIcon: openEnum(
      CliDesktopSettingsUpdate.shape.appIcon.unwrap().options,
      undefined
    ).optional(),
    terminalGpuAcceleration: openEnum(
      CliDesktopSettingsUpdate.shape.terminalGpuAcceleration.unwrap().options,
      undefined
    ).optional(),
    terminalLigatures: openEnum(
      CliDesktopSettingsUpdate.shape.terminalLigatures.unwrap().options,
      undefined
    ).optional(),
    terminalCursorStyle: openEnum(
      CliDesktopSettingsUpdate.shape.terminalCursorStyle.unwrap().options,
      undefined
    ).optional(),
    localAccountRuntime: openEnum(
      CliDesktopSettingsUpdate.shape.localAccountRuntime.unwrap().options,
      undefined
    ).optional(),
    localAgentRuntime: openEnum(
      CliDesktopSettingsUpdate.shape.localAgentRuntime.unwrap().options,
      undefined
    ).optional(),
    terminalWindowsPowerShellImplementation: openEnum(
      CliDesktopSettingsUpdate.shape.terminalWindowsPowerShellImplementation.unwrap().options,
      undefined
    ).optional(),
    claudeAgentTeamsMode: openEnum(
      CliDesktopSettingsUpdate.shape.claudeAgentTeamsMode.unwrap().options,
      undefined
    ).optional(),
    setupScriptLaunchMode: openEnum(
      CliDesktopSettingsUpdate.shape.setupScriptLaunchMode.unwrap().options,
      undefined
    ).optional(),
    terminalLinkClickBehavior: openEnum(
      CliDesktopSettingsUpdate.shape.terminalLinkClickBehavior.unwrap().options,
      undefined
    ).optional(),
    terminalUrlMiddleClickBehavior: openEnum(
      CliDesktopSettingsUpdate.shape.terminalUrlMiddleClickBehavior.unwrap().options,
      undefined
    ).optional(),
    sourceControlViewMode: openEnum(
      CliDesktopSettingsUpdate.shape.sourceControlViewMode.unwrap().options,
      undefined
    ).optional(),
    sourceControlGroupOrder: openEnum(
      CliDesktopSettingsUpdate.shape.sourceControlGroupOrder.unwrap().options,
      undefined
    ).optional(),
    ctrlTabOrderMode: openEnum(
      CliDesktopSettingsUpdate.shape.ctrlTabOrderMode.unwrap().options,
      undefined
    ).optional(),
    terminalShortcutPolicy: openEnum(
      CliDesktopSettingsUpdate.shape.terminalShortcutPolicy.unwrap().options,
      undefined
    ).optional(),
    floatingTerminalTriggerLocation: openEnum(
      CliDesktopSettingsUpdate.shape.floatingTerminalTriggerLocation.unwrap().options,
      undefined
    ).optional(),
    diffDefaultView: openEnum(
      CliDesktopSettingsUpdate.shape.diffDefaultView.unwrap().options,
      undefined
    ).optional(),
    defaultTaskViewPreset: openEnum(
      CliDesktopSettingsUpdate.shape.defaultTaskViewPreset.unwrap().options,
      undefined
    ).optional(),
    defaultTaskSource: openEnum(
      CliDesktopSettingsUpdate.shape.defaultTaskSource.unwrap().options,
      undefined
    ).optional(),
    minimaxEndpoint: openEnum(
      CliDesktopSettingsUpdate.shape.minimaxEndpoint.unwrap().options,
      undefined
    ).optional(),
    zcodePlanSite: openEnum(
      CliDesktopSettingsUpdate.shape.zcodePlanSite.unwrap().options,
      undefined
    ).optional(),
    computerAwakeMode: openEnum(
      CliDesktopSettingsUpdate.shape.computerAwakeMode.unwrap().options,
      undefined
    ).optional(),
    terminalMacOptionAsAlt: openEnum(
      CliDesktopSettingsUpdate.shape.terminalMacOptionAsAlt.unwrap().options,
      undefined
    ).optional(),
    mobilePairingConnectionMode: openEnum(
      CliDesktopSettingsUpdate.shape.mobilePairingConnectionMode.unwrap().options,
      undefined
    ).optional(),
    experimentalAgentDashboardMode: openEnum(
      CliDesktopSettingsUpdate.shape.experimentalAgentDashboardMode.unwrap().options,
      undefined
    ).optional(),
    defaultTuiAgent: z.string().nullable().optional(),
    disabledTuiAgents: z.array(z.string()).optional()
  })
  .strip()

export function projectCliDesktopSettings(settings: unknown) {
  return CliDesktopSettingsRead.parse(settings)
}
