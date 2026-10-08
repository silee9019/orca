import { z } from 'zod'
import { SettingsUpdate } from './rpc-contract/client-settings-params'
import { CliSettingsUpdate } from './cli-runtime-settings'
import { TerminalQuickCommandUpdateItem } from './rpc-contract/terminal-quick-command-params'
import { normalizeTerminalQuickCommands } from './terminal-quick-commands'
import { CommitMessageAiSettings, SourceControlAiSettings } from './rpc-contract/git-params'
import { normalizeUiLanguage, type UiLanguage } from './ui-language'
import { parseExecutionHostId, type ExecutionHostId } from './execution-host'

const NotificationSettingsUpdate = z
  .object({
    enabled: z.boolean(),
    agentTaskComplete: z.boolean(),
    terminalBell: z.boolean(),
    suppressWhenFocused: z.boolean(),
    customSoundId: z.enum([
      'system',
      'two-tone',
      'bong',
      'thump',
      'blip',
      'sonar',
      'blop',
      'ding',
      'clack',
      'beep',
      'custom'
    ]),
    customSoundPath: z.string().nullable(),
    customSoundVolume: z.number().min(0).max(100),
    mutedNotificationSourceIds: z.array(
      z.custom<ExecutionHostId>(
        (value) => typeof value === 'string' && parseExecutionHostId(value) !== null
      )
    )
  })
  .strict()

export const DesktopStructuredSettings = {
  hostSettingOverrides: z
    .record(
      z.custom<ExecutionHostId>(
        (value) => typeof value === 'string' && parseExecutionHostId(value) !== null
      ),
      z
        .object({
          displayLabel: z.string().optional(),
          defaultWorktreeLocation: z.string().optional()
        })
        .strict()
    )
    .optional(),
  nativeChatAppearance: z
    .object({
      fontSize: z.number().optional(),
      codeFontSize: z.number().optional(),
      width: z.enum(['comfortable', 'wide', 'full']).optional()
    })
    .strict()
    .optional(),
  worktreeVisibilityDefaults: SettingsUpdate.unwrap()
    .shape.worktreeVisibilityDefaults.unwrap()
    .optional(),
  uiLanguage: z
    .custom<UiLanguage>(
      (value) => typeof value === 'string' && normalizeUiLanguage(value) === value
    )
    .optional(),
  terminalCustomThemes: z
    .array(
      z
        .object({
          id: z.string(),
          name: z.string(),
          source: z.enum(['warp', 'ghostty', 'manual']),
          mode: z.enum(['dark', 'light', 'unknown']),
          terminal: z
            .object({
              foreground: z.string().optional(),
              background: z.string().optional(),
              cursor: z.string().optional(),
              cursorAccent: z.string().optional(),
              selectionBackground: z.string().optional(),
              selectionForeground: z.string().optional(),
              black: z.string().optional(),
              red: z.string().optional(),
              green: z.string().optional(),
              yellow: z.string().optional(),
              blue: z.string().optional(),
              magenta: z.string().optional(),
              cyan: z.string().optional(),
              white: z.string().optional(),
              brightBlack: z.string().optional(),
              brightRed: z.string().optional(),
              brightGreen: z.string().optional(),
              brightYellow: z.string().optional(),
              brightBlue: z.string().optional(),
              brightMagenta: z.string().optional(),
              brightCyan: z.string().optional(),
              brightWhite: z.string().optional(),
              bold: z.string().optional()
            })
            .strict(),
          importedAt: z.string(),
          sourceLabel: z.string().optional(),
          unsupportedFeatures: z.array(z.string()).optional()
        })
        .strict()
    )
    .optional(),
  terminalColorOverrides: z
    .object({
      foreground: z.string().optional(),
      background: z.string().optional(),
      cursor: z.string().optional(),
      cursorAccent: z.string().optional(),
      selectionBackground: z.string().optional(),
      selectionForeground: z.string().optional(),
      black: z.string().optional(),
      red: z.string().optional(),
      green: z.string().optional(),
      yellow: z.string().optional(),
      blue: z.string().optional(),
      magenta: z.string().optional(),
      cyan: z.string().optional(),
      white: z.string().optional(),
      brightBlack: z.string().optional(),
      brightRed: z.string().optional(),
      brightGreen: z.string().optional(),
      brightYellow: z.string().optional(),
      brightBlue: z.string().optional(),
      brightMagenta: z.string().optional(),
      brightCyan: z.string().optional(),
      brightWhite: z.string().optional(),
      bold: z.string().optional()
    })
    .strict()
    .optional(),
  terminalQuickCommands: z
    .array(TerminalQuickCommandUpdateItem)
    .transform((items, ctx) => {
      const normalized = normalizeTerminalQuickCommands(items)
      // Why: normalization truncates at the limit and drops unusable entries, so a full-list write must refuse the loss.
      if (normalized.length !== items.length) {
        ctx.addIssue({ code: 'custom', message: 'Quick command list would be truncated.' })
        return z.NEVER
      }
      return normalized
    })
    .optional(),
  localWindowsRuntimeDefault: z
    .union([
      z.object({ kind: z.literal('windows-host') }).strict(),
      z.object({ kind: z.literal('wsl'), distro: z.union([z.null(), z.string()]) }).strict()
    ])
    .optional(),
  nativeChatSessionOptions: z
    .record(
      z.string(),
      z
        .object({
          model: z.string().optional(),
          valuesByModel: z
            .record(
              z.string(),
              z.record(z.string(), z.union([z.string(), z.literal(false), z.literal(true)]))
            )
            .optional()
        })
        .strict()
    )
    .optional(),
  openInApplications: z
    .array(z.object({ id: z.string(), label: z.string(), command: z.string() }).strict())
    .optional(),
  notifications: NotificationSettingsUpdate.optional(),
  agentCmdOverrides: CliSettingsUpdate.shape.agentDefaultArgs.unwrap().optional(),
  codexSessionSourceHome: z
    .object({ host: z.string().optional(), wsl: z.record(z.string(), z.string()).optional() })
    .strict()
    .optional(),
  agentDefaultArgs: CliSettingsUpdate.shape.agentDefaultArgs.unwrap().optional(),
  agentDefaultEnv: CliSettingsUpdate.shape.agentDefaultEnv.unwrap().optional(),
  githubProjects: z
    .object({
      pinned: z.array(
        z
          .object({
            owner: z.string(),
            ownerType: z.enum(['organization', 'user']),
            number: z.number(),
            host: z.string().optional()
          })
          .strict()
      ),
      recent: z.array(
        z
          .object({
            owner: z.string(),
            ownerType: z.enum(['organization', 'user']),
            number: z.number(),
            host: z.string().optional(),
            lastOpenedAt: z.string()
          })
          .strict()
      ),
      lastViewByProject: z.record(z.string(), z.object({ viewId: z.string() }).strict()),
      activeProject: z.union([
        z.null(),
        z
          .object({
            owner: z.string(),
            ownerType: z.enum(['organization', 'user']),
            number: z.number(),
            host: z.string().optional()
          })
          .strict()
      ])
    })
    .strict()
    .optional(),
  commitMessageAi: CommitMessageAiSettings.extend({
    agentId: CliSettingsUpdate.shape.defaultTuiAgent
      .unwrap()
      .or(z.literal('custom'))
      .refine((value) => value !== 'blank')
  }).optional(),
  sourceControlAi: SourceControlAiSettings.extend({
    agentId: CliSettingsUpdate.shape.defaultTuiAgent
      .unwrap()
      .or(z.literal('custom'))
      .refine((value) => value !== 'blank'),
    instructionsByOperation: SourceControlAiSettings.shape.instructionsByOperation.unwrap()
  }).optional(),
  gitlabProjects: z
    .object({
      pinned: z.array(z.object({ host: z.string(), path: z.string() }).strict()),
      recent: z.array(
        z.object({ host: z.string(), path: z.string(), lastOpenedAt: z.string() }).strict()
      )
    })
    .strict()
    .optional()
}
