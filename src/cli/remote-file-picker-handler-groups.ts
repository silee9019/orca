import type { HandlerGroup } from './handler-group-manifest'

export const REMOTE_FILE_PICKER_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'remote-file-picker',
    keys: ['file remote-picker'],
    load: async () => (await import('./handlers/remote-file-picker.js')).REMOTE_FILE_PICKER_HANDLERS
  }
]
