import type { GhosttyImportPreview } from '../../../../shared/ghostty-import-preview'
import type { WarpThemeImportPreview } from '../../../../shared/terminal-custom-themes'
import { defineMethod } from '../core'

type ImportPreviews = {
  ghostty: () => Promise<GhosttyImportPreview>
  warpAuto: () => Promise<WarpThemeImportPreview>
}
let importPreviews: ImportPreviews | null = null

export function setDesktopImportPreviewsForRpc(previews: ImportPreviews | null): void {
  importPreviews = previews
}

function requireImportPreviews(): ImportPreviews {
  if (!importPreviews) {
    throw new Error('runtime_unavailable')
  }
  return importPreviews
}

export const WORKSPACE_IMPORT_PREVIEW_METHODS = [
  defineMethod({
    name: 'settings.previewGhosttyImport',
    params: null,
    handler: async () => {
      const previews = requireImportPreviews()
      try {
        const preview = await previews.ghostty()
        if (preview.error) {
          throw new Error('Preview failed.')
        }
        return preview
      } catch {
        throw new Error('Ghostty settings preview failed.')
      }
    }
  }),
  defineMethod({
    name: 'settings.previewWarpThemeAutoImport',
    params: null,
    handler: async () => {
      const previews = requireImportPreviews()
      try {
        const preview = await previews.warpAuto()
        if (preview.error) {
          throw new Error('Preview failed.')
        }
        return preview
      } catch {
        throw new Error('Warp theme preview failed.')
      }
    }
  })
]
