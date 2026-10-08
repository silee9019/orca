import { z } from 'zod'
export const RemoteFilePickerTarget = z.object({
  kind: z.enum(['ssh', 'runtime']),
  id: z.string().min(1)
})
export const RemoteFilePickerCommand = z
  .object({
    target: RemoteFilePickerTarget,
    instance: z.string().min(1).optional(),
    action: z.enum([
      'status',
      'navigate',
      'up',
      'select',
      'cancel',
      'input',
      'paste',
      'key',
      'row-click',
      'row-select',
      'focus-input'
    ]),
    path: z.string().min(1).max(32768).optional(),
    text: z.string().max(32768).optional(),
    key: z.enum(['Enter', 'Escape', 'Backspace']).optional(),
    entry: z.string().min(1).max(32768).optional()
  })
  .refine((command) => command.action === 'status' || command.instance !== undefined, {
    message: 'effects require the current picker instance'
  })
  .refine((command) => command.action !== 'navigate' || command.path !== undefined, {
    message: 'navigate requires a directory path'
  })
  .refine((command) => !['input', 'paste'].includes(command.action) || command.text !== undefined, {
    message: 'input and paste require text'
  })
  .refine((command) => command.action !== 'key' || command.key !== undefined, {
    message: 'key requires Enter, Escape or Backspace'
  })
  .refine(
    (command) =>
      !['row-click', 'row-select'].includes(command.action) || command.entry !== undefined,
    { message: 'row commands require a visible entry' }
  )
export type RemoteFilePickerCommand = z.infer<typeof RemoteFilePickerCommand>
export const RemoteFilePickerState = z.object({
  instance: z.string().min(1),
  target: RemoteFilePickerTarget,
  resolvedPath: z.string(),
  loading: z.boolean(),
  error: z.string().nullable(),
  filter: z.string(),
  preview: z.boolean(),
  selectDisabled: z.boolean(),
  entries: z.array(z.object({ name: z.string(), isDirectory: z.boolean() })),
  previewPath: z.string().optional(),
  previewLoading: z.boolean().optional(),
  fileHint: z.boolean().optional(),
  inputFocused: z.boolean().optional(),
  selectedPath: z.string().optional(),
  canceled: z.literal(true).optional()
})
export type RemoteFilePickerState = z.infer<typeof RemoteFilePickerState>
