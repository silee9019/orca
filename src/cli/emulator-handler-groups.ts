import type { HandlerGroup } from './handler-group-manifest'

export const EMULATOR_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'emulator',
    keys: [
      'emulator availability',
      'emulator simulators',
      'emulator detach',
      'emulator observe',
      'emulator stream',
      'emulator key',
      'emulator control',
      'emulator focus',
      'emulator wheel',
      'emulator screen-key',
      'emulator screen-paste',
      'emulator rotate-view',
      'emulator focus-group',
      'emulator select-tab',

      'emulator list',
      'emulator devices',
      'emulator attach',
      'emulator session-view',
      'emulator pointer-view',
      'emulator tap',
      'emulator type',
      'emulator gesture',
      'emulator button',
      'emulator rotate',
      'emulator exec',
      'emulator kill',
      'emulator shutdown',
      'emulator install',
      'emulator launch',
      'emulator permissions',
      'emulator ax',
      'emulator logcat'
    ],
    load: async () => (await import('./handlers/emulator.js')).EMULATOR_HANDLERS
  }
]
