import type { HandlerGroup } from './handler-group-manifest'
export const AGENT_SESSION_WATCH_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'terminal-renderer-data-watch',
    keys: ['terminal watch-renderer-data'],
    load: async () =>
      (await import('./handlers/terminal-renderer-data-watch.js'))
        .TERMINAL_RENDERER_DATA_WATCH_HANDLERS
  },
  {
    name: 'renderer-delivery-resync-watch',
    keys: ['terminal watch-delivery-resync'],
    load: async () =>
      (await import('./handlers/renderer-delivery-resync-watch.js'))
        .RENDERER_DELIVERY_RESYNC_WATCH_HANDLERS
  },
  {
    name: 'terminal-control-watch',
    keys: ['terminal watch-control-requests', 'terminal watch-model-restore'],
    load: async () =>
      (await import('./handlers/terminal-control-watch.js')).TERMINAL_CONTROL_WATCH_HANDLERS
  },
  {
    name: 'terminal-spawn-watch',
    keys: ['terminal watch-spawned'],
    load: async () =>
      (await import('./handlers/terminal-spawn-watch.js')).TERMINAL_SPAWN_WATCH_HANDLERS
  },
  {
    name: 'terminal-exit-watch',
    keys: ['terminal watch-exit'],
    load: async () =>
      (await import('./handlers/terminal-exit-watch.js')).TERMINAL_EXIT_WATCH_HANDLERS
  },
  {
    name: 'terminal-effects-watch',
    keys: ['terminal watch-effects'],
    load: async () =>
      (await import('./handlers/terminal-effects-watch.js')).TERMINAL_EFFECTS_WATCH_HANDLERS
  },
  {
    name: 'agent-worker-recovery-watch',
    keys: ['agent status watch-recovery'],
    load: async () =>
      (await import('./handlers/agent-worker-recovery-watch.js'))
        .AGENT_WORKER_RECOVERY_WATCH_HANDLERS
  },
  {
    name: 'agent-migration-watch',
    keys: ['agent status watch-migration'],
    load: async () =>
      (await import('./handlers/agent-migration-watch.js')).AGENT_MIGRATION_WATCH_HANDLERS
  },
  {
    name: 'agent-status-watch',
    keys: ['agent status watch'],
    load: async () => (await import('./handlers/agent-status-watch.js')).AGENT_STATUS_WATCH_HANDLERS
  },
  {
    name: 'structured-held-watch',
    keys: ['agent session watch-held'],
    load: async () =>
      (await import('./handlers/structured-held-watch.js')).STRUCTURED_HELD_WATCH_HANDLERS
  },
  {
    name: 'remote-workspace-watch',
    keys: ['agent remote-workspace watch'],
    load: async () =>
      (await import('./handlers/remote-workspace-watch.js')).REMOTE_WORKSPACE_WATCH_HANDLERS
  },
  {
    name: 'agent-awake-watch',
    keys: ['agent awake watch'],
    load: async () => (await import('./handlers/agent-awake-watch.js')).AGENT_AWAKE_WATCH_HANDLERS
  },
  {
    name: 'terminal-presentation-watch',
    keys: ['terminal watch-driver', 'terminal watch-fit'],
    load: async () =>
      (await import('./handlers/terminal-presentation-watch.js'))
        .TERMINAL_PRESENTATION_WATCH_HANDLERS
  },
  {
    name: 'native-chat-watch',
    keys: ['agent history watch'],
    load: async () => (await import('./handlers/native-chat-watch.js')).NATIVE_CHAT_WATCH_HANDLERS
  }
]
