import { isAbsolute } from 'node:path'
import { z } from 'zod'
import type { WarpThemeImportSource } from '../../shared/terminal-custom-themes'
import { SettingsWarpImportSource } from '../../shared/rpc-contract/settings-control-params'

const Source = z.union([
  SettingsWarpImportSource.removeDefault(),
  z.object({ kind: z.literal('chooseFile') }).strict(),
  z.object({ kind: z.literal('chooseFolder') }).strict()
])

export function validateWarpThemeImportSource(source: unknown): WarpThemeImportSource | null {
  const result = Source.safeParse(source)
  if (!result.success) {
    return null
  }
  if (result.data.kind === 'files' && result.data.paths.some((path) => !isAbsolute(path))) {
    return null
  }
  if (result.data.kind === 'folder' && !isAbsolute(result.data.path)) {
    return null
  }
  return result.data
}
