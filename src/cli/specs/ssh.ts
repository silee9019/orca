import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

const input = ['input-file', 'input-stdin']
const target = ['target']
const confirmed = ['target', 'confirm-target']
export const SSH_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['ssh', 'forward', 'watch'],
    summary: 'Observe canonical SSH port forward changes',
    usage:
      'orca ssh forward watch [--target <id>] [--duration-ms <1..60000>] [--limit <1..1000>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'target', 'duration-ms', 'limit'],
    notes: [
      'Local authenticated connection only. Uses the canonical manager/scanner snapshot and notifications. Host names, labels, process names, and URLs are excluded. Contact loss does not prove remote process exit. Ctrl+C releases the subscriber; old runtimes without port snapshots fail explicitly.'
    ]
  },
  {
    path: ['ssh', 'ports', 'watch'],
    summary: 'Observe canonical SSH detected port changes',
    usage:
      'orca ssh ports watch [--target <id>] [--duration-ms <1..60000>] [--limit <1..1000>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'target', 'duration-ms', 'limit'],
    notes: [
      'Local authenticated connection only. Uses the canonical manager/scanner snapshot and notifications. Host names, labels, process names, and URLs are excluded. Contact loss does not prove remote process exit. Ctrl+C releases the subscriber; old runtimes without port snapshots fail explicitly.'
    ]
  },
  {
    path: ['ssh', 'credential', 'watch'],
    summary: 'Observe pending SSH credential request identities and their resolution',
    usage:
      'orca ssh credential watch [--target <id>] [--duration-ms <1..60000>] [--limit <1..1000>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'target', 'duration-ms', 'limit'],
    notes: [
      'Local authenticated connection only. Pending request snapshots contain IDs, kinds, and echo policy; credential values and prompt details are excluded. Submit or cancel by the exact request ID using the existing credential commands. Ctrl+C releases the subscriber. Older runtimes without credential snapshots fail explicitly.'
    ]
  },
  {
    path: ['ssh', 'watch'],
    summary: 'Observe canonical SSH state changes for a bounded interval',
    usage: 'orca ssh watch [--target <id>] [--duration-ms <1..60000>] [--limit <1..1000>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'target', 'duration-ms', 'limit'],
    notes: [
      'Uses the local authenticated runtime client-event subscription, including its initial SSH snapshot. Ctrl+C ends observation and releases its connection. Only target identities and status are returned; connection loss does not prove remote execution has exited.'
    ]
  },
  {
    path: ['ssh', 'browse'],
    summary: 'Browse a directory on the owning SSH host',
    usage: 'orca ssh browse --target <id> --path <path> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...target, 'path']
  },
  {
    path: ['ssh', 'credential', 'list'],
    summary: 'List pending SSH credential requests without secret prompt details',
    usage: 'orca ssh credential list [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['ssh', 'target', 'list'],
    summary: 'List SSH target identities and connection states',
    usage: 'orca ssh target list [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['ssh', 'target', 'add'],
    summary: 'Save an SSH target from a JSON file or stdin',
    usage: 'orca ssh target add --input-file <file> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...input]
  },
  {
    path: ['ssh', 'target', 'update'],
    summary: 'Update one SSH target from JSON',
    usage: 'orca ssh target update --target <id> --input-file <file> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...target, ...input]
  },
  {
    path: ['ssh', 'target', 'rm'],
    destructive: true,
    summary: 'Remove the exact confirmed SSH target',
    usage: 'orca ssh target rm --target <id> --confirm-target <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...confirmed]
  },
  {
    path: ['ssh', 'target', 'removed'],
    summary: 'List remembered labels of removed SSH targets',
    usage: 'orca ssh target removed [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['ssh', 'config', 'list'],
    summary: 'List local SSH config hosts',
    usage: 'orca ssh config list [--query <text>] [--refresh] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'query', 'refresh']
  },
  {
    path: ['ssh', 'config', 'resolve'],
    summary: 'Resolve one SSH config alias',
    usage: 'orca ssh config resolve --alias <alias> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'alias']
  },
  {
    path: ['ssh', 'config', 'import'],
    summary: 'Import SSH config targets',
    usage: 'orca ssh config import [--re-adopt] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 're-adopt']
  },
  {
    path: ['ssh', 'connect'],
    summary: 'Connect one SSH target',
    usage: 'orca ssh connect --target <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...target]
  },
  {
    path: ['ssh', 'disconnect'],
    summary: 'Detach from one SSH target while preserving its remote sessions',
    usage: 'orca ssh disconnect --target <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...target]
  },
  {
    path: ['ssh', 'status'],
    summary: 'Read one SSH target connection state',
    usage: 'orca ssh status --target <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...target]
  },
  {
    path: ['ssh', 'test'],
    summary: 'Test one SSH target without disrupting a live session',
    usage: 'orca ssh test --target <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...target]
  },
  {
    path: ['ssh', 'reset'],
    destructive: true,
    summary: 'Reset the exact confirmed SSH relay',
    usage: 'orca ssh reset --target <id> --confirm-target <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...confirmed]
  },
  {
    path: ['ssh', 'terminate'],
    destructive: true,
    summary: 'Ask the exact confirmed SSH host to end its remote sessions',
    usage: 'orca ssh terminate --target <id> --confirm-target <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...confirmed]
  },
  {
    path: ['ssh', 'credential', 'required'],
    summary: 'Check whether an SSH target needs a credential prompt',
    usage: 'orca ssh credential required --target <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...target]
  },
  {
    path: ['ssh', 'credential', 'submit'],
    summary: 'Submit a credential from a file or stdin',
    usage: 'orca ssh credential submit --request <id> --input-stdin [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request', ...input]
  },
  {
    path: ['ssh', 'credential', 'cancel'],
    summary: 'Cancel one SSH credential request',
    usage: 'orca ssh credential cancel --request <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request']
  },
  {
    path: ['ssh', 'forward', 'list'],
    summary: 'List port forwards for one SSH target',
    usage: 'orca ssh forward list --target <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...target]
  },
  {
    path: ['ssh', 'forward', 'add'],
    summary: 'Forward a port using JSON input',
    usage: 'orca ssh forward add --target <id> --input-file <file> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...target, ...input]
  },
  {
    path: ['ssh', 'forward', 'update'],
    summary: 'Update one port forward on its owning SSH target',
    usage: 'orca ssh forward update --target <id> --forward <id> --input-file <file> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...target, 'forward', ...input]
  },
  {
    path: ['ssh', 'forward', 'rm'],
    destructive: true,
    summary: 'Remove one port forward on the exact confirmed SSH target',
    usage: 'orca ssh forward rm --target <id> --forward <id> --confirm-target <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...confirmed, 'forward']
  },
  {
    path: ['ssh', 'ports'],
    summary: 'List detected listening ports on one SSH target',
    usage: 'orca ssh ports --target <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...target]
  }
]
