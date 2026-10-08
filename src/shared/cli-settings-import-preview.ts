import { z } from 'zod'
import { DesktopStructuredSettings } from './cli-desktop-settings-structured'

export const SettingsWarpPreviewOutput = z.object({
  found: z.boolean(),
  sourceLabel: z.string().optional(),
  themes: z.array(
    DesktopStructuredSettings.terminalCustomThemes
      .unwrap()
      .element.extend({
        selectionValue: z.string(),
        source: z.string(),
        mode: z.string(),
        terminal: DesktopStructuredSettings.terminalCustomThemes
          .unwrap()
          .element.shape.terminal.strip()
      })
      .strip()
  ),
  skippedFiles: z.array(z.object({ label: z.string(), reason: z.string() })),
  error: z.string().optional()
})
