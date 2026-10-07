import type { CliWarpThemeImportSource } from '../../shared/rpc-contract/settings-control-params'
import { SettingsWarpPreviewOutput } from '../../shared/cli-settings-import-preview'
import type { GhosttyImportPreview } from '../../shared/ghostty-import-preview'
import type { WarpThemeImportPreview } from '../../shared/terminal-custom-themes'
import type { KeybindingService } from '../keybindings/keybinding-service'
import type { KeybindingActionId, KeybindingFileSnapshot } from '../../shared/keybindings'
import type { GlobalSettings } from '../../shared/global-settings-types'
import { projectCliDesktopSettings } from '../../shared/cli-desktop-settings'

export class RuntimeSettingsActions {
  constructor(
    private readonly dependencies: {
      previewGhosttyImport?: () => Promise<GhosttyImportPreview>
      previewWarpThemes?: (source: CliWarpThemeImportSource) => Promise<WarpThemeImportPreview>
      getKeybindings: () => KeybindingService | null
      onKeybindingsChanged: (snapshot: KeybindingFileSnapshot) => void
      listFonts: () => Promise<string[]>
      getSettings: () => GlobalSettings
      applySettings: (updates: Partial<GlobalSettings>) => Promise<GlobalSettings>
    }
  ) {}

  async previewGhosttyImport() {
    if (!this.dependencies.previewGhosttyImport) {
      throw new Error('settings_viewer_unavailable')
    }
    const preview = await this.dependencies.previewGhosttyImport()
    return {
      found: preview.found,
      configPath: preview.configPath,
      configPaths: preview.configPaths,
      unsupportedKeys: preview.unsupportedKeys,
      error: preview.error,
      diff: projectCliDesktopSettings(preview.diff)
    }
  }

  async previewWarpThemes(source: CliWarpThemeImportSource = { kind: 'auto' }) {
    if (!this.dependencies.previewWarpThemes) {
      throw new Error('settings_viewer_unavailable')
    }
    return SettingsWarpPreviewOutput.parse(await this.dependencies.previewWarpThemes(source))
  }

  getDesktopSettings() {
    return projectCliDesktopSettings(this.dependencies.getSettings())
  }

  async updateDesktopSettings(updates: Partial<GlobalSettings>) {
    return projectCliDesktopSettings(await this.dependencies.applySettings(updates))
  }

  getKeybindings(): KeybindingFileSnapshot {
    return this.keybindings().getSnapshot()
  }

  reloadKeybindings(): KeybindingFileSnapshot {
    const snapshot = this.keybindings().reload()
    this.dependencies.onKeybindingsChanged(snapshot)
    return snapshot
  }

  setKeybinding(actionId: KeybindingActionId, bindings: string[] | null): KeybindingFileSnapshot {
    const snapshot = this.keybindings().setActionBindings(actionId, bindings)
    this.dependencies.onKeybindingsChanged(snapshot)
    return snapshot
  }

  listFonts(): Promise<string[]> {
    return this.dependencies.listFonts()
  }

  private keybindings(): KeybindingService {
    const service = this.dependencies.getKeybindings()
    if (!service) {
      throw new Error('settings_viewer_unavailable')
    }
    return service
  }
}
