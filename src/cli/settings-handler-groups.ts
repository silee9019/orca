import type { HandlerGroup } from './handler-group-manifest'

export const SETTINGS_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'settings',
    keys: [
      'settings fields',
      'settings import ghostty',
      'settings import warp',
      'settings desktop get',
      'settings desktop update',
      'settings fonts',
      'settings keybindings get',
      'settings keybindings reload',
      'settings keybindings set',
      'settings preflight check',
      'settings agents detect',
      'settings agents refresh',
      'settings agents zcode-capability',
      'settings quick-commands list',
      'settings quick-commands update',
      'settings get',
      'settings update',
      'settings review-bot'
    ],
    load: async () => (await import('./handlers/settings.js')).SETTINGS_HANDLERS
  }
]
