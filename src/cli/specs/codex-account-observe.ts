import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const CODEX_ACCOUNT_OBSERVE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['accounts', 'observe-codex-stream'],
    summary:
      'Observe every Codex pending-login link change as a private boolean and subscription revision until timeout or cancellation',
    usage: 'orca accounts observe-codex-stream [--timeout <250..3600000 milliseconds>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'timeout'],
    notes: [
      'Uses the existing Codex login change source and selected host transport; does not start a login.',
      'Each link change increments the subscription revision, including true-to-true link replacements. URL values are never returned.',
      'JSON output is one event per line. The finite watch ends on timeout or Ctrl-C; older hosts fail explicitly.'
    ]
  },
  {
    path: ['accounts', 'observe-codex'],
    summary:
      'Poll Codex account and pending-login state on the selected host for a finite duration; emit changes and a final end event',
    usage:
      'orca accounts observe-codex [--timeout <250..3600000 milliseconds>] [--interval <250..60000 milliseconds>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'timeout', 'interval'],
    notes: [
      'Polling uses accounts.list with refreshUsage:false and accounts.loginStatus; it does not subscribe to account events or start a login.',
      'The default duration is 30000ms and interval is 1000ms. The interval cannot exceed the duration.',
      'Polling can miss transitions between samples and cannot distinguish different links while browserAuthorizationPending stays true. Use observe-codex-stream for every active link change.',
      'JSON output is one event per line. Account email, home paths and login URL values are never returned.'
    ]
  }
]
