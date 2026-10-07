import { z } from 'zod'
import { isKeybindingActionId, type KeybindingActionId } from '../keybindings'

export const SettingsKeybindingUpdate = z
  .object({
    actionId: z.custom<KeybindingActionId>(
      (value) => typeof value === 'string' && isKeybindingActionId(value)
    ),
    bindings: z.array(z.string().min(1).max(256)).max(32).nullable()
  })
  .strict()

export const SettingsWarpImportSource = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('auto') }).strict(),
    z
      .object({ kind: z.literal('files'), paths: z.array(z.string().min(1)).min(1).max(200) })
      .strict(),
    z.object({ kind: z.literal('folder'), path: z.string().min(1) }).strict()
  ])
  .default({ kind: 'auto' })
export type CliWarpThemeImportSource = z.infer<typeof SettingsWarpImportSource>
