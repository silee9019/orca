import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const DAEMON_RESTART_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['terminal', 'daemon', 'restart-plan'],
    summary: 'Inspect the selected host daemon generation and restart impact',
    usage: 'orca terminal daemon restart-plan [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Returns runtimeId, daemonIdentityDigest, protocolVersion and explicit current-provider scope. No daemon is restarted. Local means native execution on the selected runtime, including paired hosts; SSH relay daemons are outside this scope.'
    ]
  },
  {
    path: ['terminal', 'daemon', 'restart'],
    summary: 'Restart one observed daemon generation and interrupt all current-provider sessions',
    usage: 'orca terminal daemon restart --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    destructive: true,
    notes: [
      'Strict private JSON requires runtimeId, executionHostId:local, daemonIdentityDigest, protocolVersion, scope:current-protocol-daemon-and-native-fallbacks and confirm:true from restart-plan. Confirmation covers all current-provider sessions at execution, including newly created native fallback sessions. Legacy-protocol daemons are preserved.',
      'Calls the existing restart coordinator with authenticated daemon identity checks and no PID-cleanup fallback. Busy, stale, uninitialized and old hosts are refused. Receipt reports replacement observation and interrupted-session count, not proof that every process exited or renderer restored. No automatic retry.'
    ]
  }
]
