import { SettingsWarpPreviewOutput } from './cli-settings-import-preview'
import { describe, expect, it } from 'vitest'
import { CliDesktopSettingsUpdate, projectCliDesktopSettings } from './cli-desktop-settings'
import { createGlobalSettingsFixture } from './global-settings-test-fixture'

describe('desktop settings CLI boundary', () => {
  it('projects complete default settings without credentials or launch commands', () => {
    const settings = createGlobalSettingsFixture({
      httpProxyUrl: 'http://user:proxy-canary@example.test',
      localBaseRefSuggestionDismissed: true,
      opencodeSessionCookie: 'cookie-canary',
      agentDefaultEnv: { codex: { KEY: 'env-canary' } },
      agentCmdOverrides: { codex: 'command-canary' },
      nativeChatSessionOptions: {
        codex: { valuesByModel: { future: { apiKey: 'native-canary' } } }
      },
      terminalQuickCommands: [
        { id: 'id', label: 'label', command: 'quick-canary', appendEnter: false }
      ]
    })
    const result = projectCliDesktopSettings(settings)
    expect(result).toMatchObject({
      theme: settings.theme,
      terminalFontSize: settings.terminalFontSize,
      localBaseRefSuggestionDismissed: true
    })
    expect(JSON.stringify(result)).not.toContain('canary')
  })

  it('keeps newer enum replies readable without weakening mutation validation', () => {
    expect(
      projectCliDesktopSettings({
        theme: 'future-theme',
        machineName: 'host',
        defaultTuiAgent: 'future-agent'
      })
    ).toEqual({ theme: undefined, machineName: 'host', defaultTuiAgent: 'future-agent' })
    expect(CliDesktopSettingsUpdate.safeParse({ theme: 'future-theme' }).success).toBe(false)
    expect(() => projectCliDesktopSettings({ theme: 7 })).toThrow()
  })

  it('still reads the power keys that the writer rejects', () => {
    const power = { computerAwakeMode: 'on', keepComputerAwakeWhileAgentsRun: true }
    expect(projectCliDesktopSettings(power)).toEqual(power)
    expect(projectCliDesktopSettings({ computerAwakeMode: 'future-mode' })).toEqual({
      computerAwakeMode: undefined
    })
    expect(CliDesktopSettingsUpdate.safeParse(power).success).toBe(false)
  })

  it('reads newer theme metadata without exposing unknown fields', () => {
    const result = SettingsWarpPreviewOutput.parse({
      found: true,
      themes: [
        {
          id: 'fixture',
          name: 'Fixture',
          source: 'future-source',
          mode: 'future-mode',
          terminal: { background: '#000000', futureSecret: 'color-canary' },
          importedAt: '2026-01-01T00:00:00Z',
          selectionValue: 'custom:fixture',
          futureSecret: 'theme-canary'
        }
      ],
      skippedFiles: [],
      futureSecret: 'preview-canary'
    })
    expect(result.themes[0]?.source).toBe('future-source')
    expect(JSON.stringify(result)).not.toContain('canary')
  })

  it('validates nested preferences and keeps secret input for the trusted apply path', () => {
    const result = CliDesktopSettingsUpdate.parse({
      theme: 'dark',
      localBaseRefSuggestionDismissed: true,
      terminalFontSize: 18,
      opencodeSessionCookie: 'input-canary',
      nativeChatAppearance: { fontSize: 16, width: 'wide' },
      terminalCustomThemes: [],
      agentDefaultEnv: { codex: { KEY: 'env-canary' } }
    })
    expect(result).toMatchObject({
      theme: 'dark',
      localBaseRefSuggestionDismissed: true,
      opencodeSessionCookie: 'input-canary'
    })
    expect(result.nativeChatAppearance).toEqual({ fontSize: 16, width: 'wide' })
  })

  it.each([
    { pluginConsents: { arbitrary: 'trusted' } },
    { floatingTerminalTrustedCwds: ['/unapproved'] },
    { activeRuntimeEnvironmentId: 'another-host' },
    { nestedWorkerMaxDepth: 99 },
    { nestedWorkerMaxDepth: 1 },
    { artifactSharingEnabled: true },
    { skipDeleteWorktreeConfirm: true },
    { theme: 'invalid' },
    { terminalActivePaneOpacity: 8 },
    { agentDefaultEnv: { codex: { KEY: 7 } } },
    { terminalColorOverrides: { background: 7 } }
  ])('rejects authority bypasses and malformed nested input', (input) => {
    expect(CliDesktopSettingsUpdate.safeParse(input).success).toBe(false)
  })
})
