import { z } from 'zod'
import type { GlobalSettings } from './global-settings-types'
import { CliSettingsUpdate } from './cli-runtime-settings'
import { DesktopStructuredSettings } from './cli-desktop-settings-structured'
import { isNativeChatShellEnvironmentName } from './native-chat-shell-environment'
import {
  MAX_TERMINAL_CONTRAST_RATIO,
  MIN_TERMINAL_CONTRAST_RATIO
} from './terminal-minimum-contrast-settings'
import { MAX_TERMINAL_LINE_HEIGHT, MIN_TERMINAL_LINE_HEIGHT } from './terminal-line-height-settings'
import { TERMINAL_FONT_WEIGHT_MAX, TERMINAL_FONT_WEIGHT_MIN } from './terminal-fonts'
import {
  DESKTOP_TERMINAL_SCROLLBACK_ROWS_MAX,
  DESKTOP_TERMINAL_SCROLLBACK_ROWS_MIN
} from './terminal-scrollback-policy'

// Read-side shape: lenient on numbers so profiles written by older builds still project.
export const CliDesktopSettingsFields = z
  .object({
    ...DesktopStructuredSettings,
    workspaceDir: z.string().optional(),
    rightSidebarOpenByDefault: z.boolean().optional(),
    experimentalCompactWorktreeCards: z.boolean().optional(),
    experimentalSidekick: z.boolean().optional(),
    nestWorkspaces: z.boolean().optional(),
    refreshLocalBaseRefOnWorktreeCreate: z.boolean().optional(),
    localBaseRefSuggestionDismissed: z.boolean().optional(),
    autoRenameBranchFromWork: z.boolean().optional(),
    branchPrefix: z.enum(['git-username', 'custom', 'none']).optional(),
    branchPrefixCustom: z.string().optional(),
    theme: z.enum(['system', 'dark', 'light']).optional(),
    leftSidebarAppearanceMode: z.enum(['default', 'match-terminal', 'tinted']).optional(),
    leftSidebarTintColor: z.string().optional(),
    leftSidebarTintOpacity: z.number().min(0).max(1).optional(),
    appIcon: z.enum(['classic', 'watercolor', 'blue']).optional(),
    appFontFamily: z.string().optional(),
    editorAutoSave: z.boolean().optional(),
    editorAutoSaveDelayMs: z.number().nonnegative().optional(),
    editorMinimapEnabled: z.boolean().optional(),
    editorFontFamily: z.string().optional(),
    editorWordWrap: z.boolean().optional(),
    richMarkdownSpellcheckEnabled: z.boolean().optional(),
    markdownReviewToolsEnabled: z.boolean().optional(),
    primarySelectionMiddleClickPaste: z.boolean().optional(),
    terminalFontSize: z.number().min(1).max(200).optional(),
    terminalFontFamily: z.string().optional(),
    terminalFontWeight: z.number().optional(),
    terminalFontWeightBold: z.number().optional(),
    terminalLineHeight: z.number().optional(),
    terminalScrollSensitivity: z.number().positive().max(1000).optional(),
    terminalFastScrollSensitivity: z.number().positive().max(1000).optional(),
    terminalTuiScrollSensitivity: z.number().positive().max(1000).optional(),
    terminalGpuAcceleration: z.enum(['auto', 'on', 'off']).optional(),
    terminalLigatures: z.enum(['auto', 'on', 'off']).optional(),
    terminalInlineImages: z.boolean().optional(),
    terminalCursorStyle: z.enum(['bar', 'block', 'underline']).optional(),
    terminalCursorBlink: z.boolean().optional(),
    terminalThemeDark: z.string().optional(),
    terminalDividerColorDark: z.string().optional(),
    terminalUseSeparateLightTheme: z.boolean().optional(),
    terminalThemeLight: z.string().optional(),
    terminalDividerColorLight: z.string().optional(),
    terminalInactivePaneOpacity: z.number().min(0).max(1).optional(),
    terminalActivePaneOpacity: z.number().min(0).max(1).optional(),
    terminalPaneOpacityTransitionMs: z.number().nonnegative().optional(),
    terminalDividerThicknessPx: z.number().optional(),
    terminalBackgroundOpacity: z.number().min(0).max(1).optional(),
    terminalMinimumContrastRatio: z.number().optional(),
    terminalPaddingX: z.number().nonnegative().optional(),
    terminalPaddingY: z.number().nonnegative().optional(),
    terminalMouseHideWhileTyping: z.boolean().optional(),
    terminalWordSeparator: z.string().optional(),
    terminalCursorOpacity: z.number().min(0).max(1).optional(),
    windowBackgroundBlur: z.boolean().optional(),
    minimizeToTrayOnClose: z.boolean().optional(),
    showMenuBarIcon: z.boolean().optional(),
    terminalRightClickToPaste: z.boolean().optional(),
    terminalWindowsShell: z.string().optional(),
    terminalDefaultShell: z.string().optional(),
    terminalDefaultShellArgs: z.array(z.string()).optional(),
    terminalWindowsWslDistro: z.union([z.null(), z.string()]).optional(),
    localAccountRuntime: z.enum(['auto', 'host', 'wsl']).optional(),
    localAccountWslDistro: z.union([z.null(), z.string()]).optional(),
    localAgentRuntime: z.enum(['host', 'wsl']).optional(),
    localAgentWslDistro: z.union([z.null(), z.string()]).optional(),
    terminalWindowsPowerShellImplementation: z
      .enum(['auto', 'powershell.exe', 'pwsh.exe'])
      .optional(),
    terminalFocusFollowsMouse: z.boolean().optional(),
    terminalClipboardOnSelect: z.boolean().optional(),
    terminalCopyTrimsGutter: z.boolean().optional(),
    terminalAllowOsc52Clipboard: z.boolean().optional(),
    claudeAgentTeamsMode: z.enum(['off', 'in-process', 'native-panes-shim']).optional(),
    setupScriptLaunchMode: z.enum(['split-vertical', 'split-horizontal', 'new-tab']).optional(),
    terminalScrollbackRows: z.number().nonnegative().optional(),
    httpProxyUrl: z.string().optional(),
    httpProxyBypassRules: z.string().optional(),
    electronHttp1CompatibilityMode: z.boolean().optional(),
    openLinksInApp: z.boolean().optional(),
    localhostWorktreeLabelsEnabled: z.boolean().optional(),
    openLinksInAppModifierInverts: z.boolean().optional(),
    terminalLinkActionPopoverEnabled: z.boolean().optional(),
    terminalLinkClickBehavior: z.enum(['none', 'actions', 'open']).optional(),
    terminalUrlMiddleClickBehavior: z.enum(['none', 'actions', 'open']).optional(),
    openAgentTabsInChatByDefault: z.boolean().optional(),
    experimentalNativeChat: z.boolean().optional(),
    experimentalStructuredNativeChat: z.boolean().optional(),
    nativeChatResumeWorkOnRestart: z.boolean().optional(),
    nativeChatQueueFollowUps: z.boolean().optional(),
    nativeChatShellEnvironmentVariables: z.array(z.string()).optional(),
    followSymlinkedDirectories: z.boolean().optional(),
    showGitIgnoredFiles: z.boolean().optional(),
    sourceControlViewMode: z.enum(['list', 'tree']).optional(),
    sourceControlGroupOrder: z
      .enum(['changes-first', 'staged-first', 'untracked-first'])
      .optional(),
    sourceControlCompareAgainstUpstream: z.boolean().optional(),
    showTitlebarAppName: z.boolean().optional(),
    showTasksButton: z.boolean().optional(),
    showAutomationsButton: z.boolean().optional(),
    showArtifactsButton: z.boolean().optional(),
    showSkillsButton: z.boolean().optional(),
    showMobileButton: z.boolean().optional(),
    showPinnedWorktreesInGroups: z.boolean().optional(),
    ctrlTabOrderMode: z.enum(['mru', 'sequential']).optional(),
    terminalShortcutPolicy: z.enum(['orca-first', 'terminal-first']).optional(),
    floatingTerminalEnabled: z.boolean().optional(),
    browserClientHostedRemoteEnabled: z.boolean().optional(),
    browserSshWorkspaceRoutingEnabled: z.boolean().optional(),
    browserSshWorkspaceRoutingDisabledTargetIds: z.array(z.string()).optional(),
    floatingTerminalCwd: z.string().optional(),
    floatingTerminalTriggerLocation: z.enum(['floating-button', 'status-bar']).optional(),
    diffDefaultView: z.enum(['inline', 'side-by-side']).optional(),
    diffWordWrap: z.boolean().optional(),
    diffShowWhitespace: z.boolean().optional(),
    diffCollapseUnchangedRegions: z.boolean().optional(),
    combinedDiffFileTreeVisibleByDefault: z.boolean().optional(),
    prBotAuthorOverrides: z.array(z.string()).optional(),
    promptCacheTimerEnabled: z.boolean().optional(),
    promptCacheTtlMs: z.number().nonnegative().optional(),
    terminalScopeHistoryByWorktree: z.boolean().optional(),
    terminalHiddenViewParking: z.boolean().optional(),
    terminalSshViewParking: z.boolean().optional(),
    terminalHiddenWorktreeRetentionBudget: z.boolean().optional(),
    browserGuestWorktreeRetentionBudget: z.boolean().optional(),
    terminalMainSideEffectAuthority: z.boolean().optional(),
    terminalHiddenDeliveryGate: z.boolean().optional(),
    terminalModelQueryAuthority: z.boolean().optional(),
    defaultTuiAgent: CliSettingsUpdate.shape.defaultTuiAgent,
    disabledTuiAgents: CliSettingsUpdate.shape.disabledTuiAgents,
    defaultTaskViewPreset: z
      .enum(['all', 'issues', 'review', 'my-issues', 'my-prs', 'prs'])
      .optional(),
    defaultTaskSource: z.enum(['github', 'gitlab', 'linear', 'jira']).optional(),
    visibleTaskProviders: z.array(z.enum(['github', 'gitlab', 'linear', 'jira'])).optional(),
    defaultRepoSelection: z.union([z.null(), z.array(z.string())]).optional(),
    defaultLinearTeamSelection: z.union([z.null(), z.array(z.string())]).optional(),
    opencodeSessionCookie: z.string().optional(),
    opencodeWorkspaceId: z.string().optional(),
    minimaxGroupId: z.string().optional(),
    minimaxUsageModels: z.string().optional(),
    minimaxEndpoint: z.enum(['overseas', 'cn']).optional(),
    zcodePlanSite: z.enum(['zai', 'bigmodel']).optional(),
    agentStatusHooksEnabled: z.boolean().optional(),
    agentStateRulesPath: z.union([z.null(), z.string()]).optional(),
    agentStateRulesLiveUpdates: z.boolean().optional(),
    codexTerminalServerIsolation: z.boolean().optional(),
    codexSharedServerWarning: z.boolean().optional(),
    tabAutoGenerateTitle: z.boolean().optional(),
    confirmClosePinnedTab: z.boolean().optional(),
    editorPreviewTabsEnabled: z.boolean().optional(),
    keepComputerAwakeWhileAgentsRun: z.boolean().optional(),
    computerAwakeMode: z.enum(['auto', 'on', 'off']).optional(),
    terminalMacOptionAsAlt: z.enum(['auto', 'true', 'false', 'left', 'right']).optional(),
    terminalJISYenToBackslash: z.boolean().optional(),
    experimentalMobile: z.boolean().optional(),
    mobileEmulatorEnabled: z.boolean().optional(),
    mobileEmulatorDefaultDeviceUdid: z.union([z.null(), z.string()]).optional(),
    androidSdkPath: z.union([z.null(), z.string()]).optional(),
    mobileAutoRestoreFitMs: z.union([z.null(), z.number().nonnegative()]).optional(),
    mobilePairingConnectionMode: z.enum(['automatic', 'local-only']).optional(),
    mobilePairingCustomAddress: z.union([z.null(), z.string()]).optional(),
    mobilePairingCustomAddresses: z.array(z.string()).optional(),
    machineName: z.string().optional(),
    experimentalPet: z.boolean().optional(),
    experimentalActivity: z.boolean().optional(),
    experimentalAgentDashboardPopout: z.boolean().optional(),
    experimentalAgentDashboardMode: z.enum(['in-window', 'popout']).optional(),
    experimentalAgentDashboardShowIdle: z.boolean().optional(),
    experimentalTerminalAttention: z.boolean().optional(),
    experimentalAgentHibernation: z.boolean().optional(),
    agentHibernationIdleMs: z.number().nonnegative().optional(),
    experimentalNewWorktreeCardStyle: z.boolean().optional(),
    experimentalEphemeralVms: z.boolean().optional(),
    compactWorktreeCards: z.boolean().optional()
  })
  .strip()

// Each range is the one the Settings control that writes the key enforces.
const UiRangeSettings = {
  terminalFontSize: z.number().int().min(10).max(24).optional(),
  terminalFontWeight: z
    .number()
    .min(TERMINAL_FONT_WEIGHT_MIN)
    .max(TERMINAL_FONT_WEIGHT_MAX)
    .optional(),
  terminalFontWeightBold: z
    .number()
    .min(TERMINAL_FONT_WEIGHT_MIN)
    .max(TERMINAL_FONT_WEIGHT_MAX)
    .optional(),
  terminalLineHeight: z
    .number()
    .min(MIN_TERMINAL_LINE_HEIGHT)
    .max(MAX_TERMINAL_LINE_HEIGHT)
    .optional(),
  terminalMinimumContrastRatio: z
    .number()
    .min(MIN_TERMINAL_CONTRAST_RATIO)
    .max(MAX_TERMINAL_CONTRAST_RATIO)
    .optional(),
  terminalScrollSensitivity: z.number().min(0.5).max(3).optional(),
  terminalFastScrollSensitivity: z.number().min(1).max(10).optional(),
  terminalTuiScrollSensitivity: z.number().int().min(1).max(10).optional(),
  terminalDividerThicknessPx: z.number().min(1).max(32).optional(),
  terminalPaddingX: z.number().min(0).max(512).optional(),
  terminalPaddingY: z.number().min(0).max(512).optional(),
  terminalScrollbackRows: z
    .number()
    .int()
    .min(DESKTOP_TERMINAL_SCROLLBACK_ROWS_MIN)
    .max(DESKTOP_TERMINAL_SCROLLBACK_ROWS_MAX)
    .optional(),
  nativeChatAppearance: DesktopStructuredSettings.nativeChatAppearance
    .unwrap()
    .extend({
      fontSize: z.number().int().min(12).max(20).optional(),
      codeFontSize: z.number().int().min(10).max(18).optional()
    })
    .optional(),
  nativeChatShellEnvironmentVariables: z
    .array(z.string().refine(isNativeChatShellEnvironmentName))
    .optional()
}

export const CliDesktopSettingsUpdate = CliDesktopSettingsFields.extend(
  UiRangeSettings
).strict() satisfies z.ZodType<Partial<GlobalSettings>>
