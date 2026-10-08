import { z } from 'zod'

export const BrowserToolbarAction = z.enum([
  'back-shortcut',
  'forward-shortcut',
  'back',
  'forward',
  'reload-button',
  'reload',
  'hard-reload'
])
export type BrowserToolbarAction = z.infer<typeof BrowserToolbarAction>
