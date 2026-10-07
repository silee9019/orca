import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KeybindingService } from '../keybindings/keybinding-service'
import { createGlobalSettingsFixture } from '../../shared/global-settings-test-fixture'
import { RuntimeSettingsActions } from './runtime-settings-actions'

let home: string
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'orca-settings-actions-'))
})
afterEach(async () => {
  await rm(home, { recursive: true, force: true })
})

describe('runtime desktop settings actions', () => {
  it('changes and reloads the existing keybinding service and its actual file', async () => {
    const keybindings = new KeybindingService({ homePath: home, platform: 'linux' })
    const changed = vi.fn()
    const settings = createGlobalSettingsFixture()
    const actions = new RuntimeSettingsActions({
      getKeybindings: () => keybindings,
      onKeybindingsChanged: changed,
      listFonts: async () => ['Test Font'],
      getSettings: () => settings,
      applySettings: async () => settings
    })
    const applied = actions.setKeybinding('app.settings', ['Ctrl+Alt+Shift+F12'])
    expect(applied.overrides['app.settings']).toEqual(['Ctrl+Alt+Shift+F12'])
    expect(
      JSON.parse(await readFile(keybindings.getPath(), 'utf8')).platforms.linux['app.settings']
    ).toEqual(['Ctrl+Alt+Shift+F12'])
    expect(changed).toHaveBeenCalledExactlyOnceWith(applied)
    expect(actions.reloadKeybindings().overrides['app.settings']).toEqual(['Ctrl+Alt+Shift+F12'])
    expect(changed).toHaveBeenCalledTimes(2)
    const reset = actions.setKeybinding('app.settings', null)
    expect(reset.platformOverrides.linux).toEqual({})
    expect(await actions.listFonts()).toEqual(['Test Font'])
  })

  it('uses existing import preview callbacks without applying settings', async () => {
    const settings = createGlobalSettingsFixture()
    const applySettings = vi.fn(async () => settings)
    const previewGhosttyImport = vi.fn(async () => ({
      found: true,
      diff: { terminalFontSize: 18, opencodeSessionCookie: 'secret-canary' },
      unsupportedKeys: []
    }))
    const previewWarpThemes = vi.fn(async () => ({
      found: true,
      themes: [
        {
          id: 'fixture',
          name: 'Fixture',
          source: 'warp' as const,
          mode: 'dark' as const,
          terminal: { background: '#101010' },
          importedAt: '2026-01-01T00:00:00Z',
          selectionValue: 'custom:fixture'
        }
      ],
      skippedFiles: []
    }))
    const actions = new RuntimeSettingsActions({
      getKeybindings: () => null,
      onKeybindingsChanged: () => {},
      listFonts: async () => [],
      getSettings: () => settings,
      applySettings,
      previewGhosttyImport,
      previewWarpThemes
    })
    expect(await actions.previewGhosttyImport()).toMatchObject({ diff: { terminalFontSize: 18 } })
    expect(JSON.stringify(await actions.previewGhosttyImport())).not.toContain('canary')
    expect(await actions.previewWarpThemes()).toMatchObject({
      themes: [{ selectionValue: 'custom:fixture' }]
    })
    expect(previewWarpThemes).toHaveBeenCalledTimes(1)
    expect(applySettings).not.toHaveBeenCalled()
  })

  it('does not replace a shortcut file or notify when the existing validator rejects input', async () => {
    const keybindings = new KeybindingService({ homePath: home, platform: 'linux' })
    keybindings.ensureFile()
    const before = await readFile(keybindings.getPath(), 'utf8')
    const changed = vi.fn()
    const settings = createGlobalSettingsFixture()
    const actions = new RuntimeSettingsActions({
      getKeybindings: () => keybindings,
      onKeybindingsChanged: changed,
      listFonts: async () => [],
      getSettings: () => settings,
      applySettings: async () => settings
    })
    expect(() => actions.setKeybinding('app.settings', ['invalid shortcut'])).toThrow()
    expect(await readFile(keybindings.getPath(), 'utf8')).toBe(before)
    expect(changed).not.toHaveBeenCalled()
  })

  it('returns a redacted apply read-back and preserves the same profile getter', async () => {
    let settings = createGlobalSettingsFixture({
      theme: 'light',
      opencodeSessionCookie: 'old-canary'
    })
    const applySettings = vi.fn(async (updates) => {
      settings = { ...settings, ...updates }
      return settings
    })
    const actions = new RuntimeSettingsActions({
      getKeybindings: () => null,
      onKeybindingsChanged: () => {},
      listFonts: async () => [],
      getSettings: () => settings,
      applySettings
    })
    const result = await actions.updateDesktopSettings({
      theme: 'dark',
      opencodeSessionCookie: 'new-canary'
    })
    expect(result.theme).toBe('dark')
    expect(settings.opencodeSessionCookie).toBe('new-canary')
    expect(JSON.stringify(result)).not.toContain('canary')
    expect(actions.getDesktopSettings().theme).toBe('dark')
    expect(applySettings).toHaveBeenCalledTimes(1)
    expect(() => actions.getKeybindings()).toThrow('settings_viewer_unavailable')
  })
})
