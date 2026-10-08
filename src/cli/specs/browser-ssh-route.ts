import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const BROWSER_SSH_ROUTE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'ssh-route'],
    summary: 'Apply an exact visible SSH browser routing recovery action',
    usage:
      'orca browser ssh-route --viewer host --worktree <workspace> --page <page> --target <ssh-target> --profile <profile> [--error-kind <forwarding-blocked|ssh-unavailable|unknown>] --action <retry|try-without-probe|browse-local|recheck|prepare> [--url <failed-navigation-url> --error-code <code>] [--confirm] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'viewer',
      'worktree',
      'page',
      'target',
      'profile',
      'error-kind',
      'url',
      'error-code',
      'action',
      'confirm'
    ],
    notes: [
      'Requires one active routing gate with matching target and profile. Recovery actions also require the current error. Partition preparation, probe bypass, local browsing and recheck require --confirm. Prepare waits for the exact owner’s new attempt to return a ready partition; partition names and provider errors are not printed. It preserves the existing probe policy and does not prove page navigation or network access. Retry acknowledges the next routing attempt, not completed network access. Recheck requires a routed failed page and removes only the named target’s skipped probe policy; --url and --error-code identify that current failure. Policy changes are observed in the viewer store; durable persistence and native rendering are not acknowledged.'
    ]
  }
]
