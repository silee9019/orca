import { describe, expect, it } from 'vitest'
import { CliDesktopSettingsUpdate, projectCliDesktopSettings } from './cli-desktop-settings'

const accepts = (input: Record<string, unknown>) =>
  CliDesktopSettingsUpdate.safeParse(input).success

// Each row mirrors the control that writes the key in Settings; edges are inclusive.
const UI_RANGES: [key: string, min: number, max: number][] = [
  ['terminalFontSize', 10, 24],
  ['terminalFontWeight', 100, 900],
  ['terminalFontWeightBold', 100, 900],
  ['terminalLineHeight', 1, 3],
  ['terminalMinimumContrastRatio', 1, 21],
  ['terminalScrollSensitivity', 0.5, 3],
  ['terminalFastScrollSensitivity', 1, 10],
  ['terminalTuiScrollSensitivity', 1, 10],
  ['terminalDividerThicknessPx', 1, 32],
  ['terminalPaddingX', 0, 512],
  ['terminalPaddingY', 0, 512],
  ['terminalScrollbackRows', 1000, 50000]
]

describe('desktop settings update keeps the Settings UI value ranges', () => {
  it.each(UI_RANGES)('%s accepts %d..%d and rejects values outside', (key, min, max) => {
    expect(accepts({ [key]: min })).toBe(true)
    expect(accepts({ [key]: max })).toBe(true)
    expect(accepts({ [key]: min - 0.1 })).toBe(false)
    expect(accepts({ [key]: max + 0.1 })).toBe(false)
  })

  it.each(['terminalFontSize', 'terminalTuiScrollSensitivity', 'terminalScrollbackRows'])(
    '%s only takes whole numbers like its UI control',
    (key) => {
      expect(accepts({ [key]: 12.5 })).toBe(false)
    }
  )

  it('keeps native chat appearance inside the chat font controls', () => {
    expect(accepts({ nativeChatAppearance: { fontSize: 12, codeFontSize: 10 } })).toBe(true)
    expect(accepts({ nativeChatAppearance: { fontSize: 20, codeFontSize: 18 } })).toBe(true)
    expect(accepts({ nativeChatAppearance: { fontSize: 11 } })).toBe(false)
    expect(accepts({ nativeChatAppearance: { fontSize: 21 } })).toBe(false)
    expect(accepts({ nativeChatAppearance: { codeFontSize: 9 } })).toBe(false)
    expect(accepts({ nativeChatAppearance: { codeFontSize: 19 } })).toBe(false)
  })

  it('keeps the chat appearance object strict after narrowing its sizes', () => {
    expect(accepts({ nativeChatAppearance: { fontSize: 14, unknown: 1 } })).toBe(false)
  })

  it('still reads profiles written outside the UI ranges', () => {
    expect(
      projectCliDesktopSettings({
        terminalFontSize: 9,
        terminalPaddingX: 600,
        terminalScrollbackRows: 120,
        nativeChatAppearance: { fontSize: 30 }
      })
    ).toEqual({
      terminalFontSize: 9,
      terminalPaddingX: 600,
      terminalScrollbackRows: 120,
      nativeChatAppearance: { fontSize: 30 }
    })
  })

  it('takes only shell-valid names for native chat environment variables', () => {
    expect(accepts({ nativeChatShellEnvironmentVariables: ['PATH', '_OK1'] })).toBe(true)
    expect(accepts({ nativeChatShellEnvironmentVariables: ['1BAD'] })).toBe(false)
    expect(accepts({ nativeChatShellEnvironmentVariables: ['A B'] })).toBe(false)
  })

  it.each([
    { aiVaultSearch: { enabled: true } },
    { nestedWorkerMaxDepth: 2 },
    { skipCloseTerminalWithRunningProcessConfirm: true }
  ])('keeps protected consent and fence settings out of the generic writer', (input) => {
    expect(accepts(input)).toBe(false)
  })
})

// Keys the agent-session surfaces write through Settings; a removed key here means a row lost its CLI writer.
const AGENT_SESSION_KEY_SAMPLES: Record<string, unknown> = {
  floatingTerminalEnabled: true,
  floatingTerminalTriggerLocation: 'status-bar',
  nativeChatResumeWorkOnRestart: false,
  nativeChatQueueFollowUps: true,
  openAgentTabsInChatByDefault: true,
  codexTerminalServerIsolation: true,
  codexSharedServerWarning: false,
  confirmClosePinnedTab: false,
  codexSessionSourceHome: { host: '/tmp/codex-home' },
  nativeChatSessionOptions: { codex: { model: 'fixture' } },
  setupScriptLaunchMode: 'new-tab',
  terminalWindowsShell: 'pwsh.exe',
  terminalDefaultShell: '/bin/zsh',
  terminalDefaultShellArgs: ['-l'],
  terminalWordSeparator: ' ',
  terminalFontFamily: 'Menlo',
  terminalCursorBlink: true,
  terminalCursorStyle: 'bar',
  terminalCursorOpacity: 0.5,
  terminalBackgroundOpacity: 0.8,
  terminalInactivePaneOpacity: 0.6,
  terminalFocusFollowsMouse: true,
  terminalMouseHideWhileTyping: true,
  terminalRightClickToPaste: true,
  terminalJISYenToBackslash: true,
  terminalGpuAcceleration: 'off',
  terminalMacOptionAsAlt: 'left',
  terminalShortcutPolicy: 'terminal-first',
  terminalThemeDark: 'Dracula',
  terminalThemeLight: 'Builtin Light',
  terminalUseSeparateLightTheme: true,
  terminalDividerColorDark: '#111111',
  terminalDividerColorLight: '#eeeeee',
  terminalColorOverrides: { background: '#000000' },
  terminalQuickCommands: [{ id: 'a', label: 'A', command: 'ls', appendEnter: true }]
}

describe('agent-session Settings keys keep a desktop update writer', () => {
  it.each(Object.entries(AGENT_SESSION_KEY_SAMPLES))('%s', (key, value) => {
    expect(accepts({ [key]: value })).toBe(true)
  })
})
