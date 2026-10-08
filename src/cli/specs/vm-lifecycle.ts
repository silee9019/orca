import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const VM_LIFECYCLE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['vm', 'recipes'],
    summary: 'List approved recipes for a local git repository',
    usage: 'orca vm recipes --repo <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'repo']
  },
  {
    path: ['vm', 'catalog'],
    summary: 'List approved repository and plugin VM recipes',
    usage: 'orca vm catalog [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['vm', 'doctor'],
    summary: 'Validate the selected approved VM recipe',
    usage: 'orca vm doctor --repo <id> --recipe <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'repo', 'recipe']
  },
  {
    path: ['vm', 'provision'],
    summary: 'Provision a VM from an approved recipe',
    usage:
      'orca vm provision --repo <id> --recipe <id> --provision-id <id> [--name <name>] [--project <id>] [--workspace <id>] [--branch <branch>] [--ref <ref>] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'repo',
      'recipe',
      'provision-id',
      'name',
      'project',
      'workspace',
      'branch',
      'ref'
    ]
  },
  {
    path: ['vm', 'cancel'],
    summary: 'Cancel a VM provision operation by its request identity',
    usage: 'orca vm cancel --provision-id <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'provision-id']
  },
  {
    path: ['vm', 'provision-status'],
    summary: 'Read provision lifecycle and output activity without provider output',
    usage: 'orca vm provision-status --provision-id <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'provision-id'],
    notes: [
      'A cancel request does not prove resource termination. State is kept only for this desktop runtime session.'
    ]
  },
  {
    path: ['vm', 'runtimes'],
    summary: 'List VM runtime and cleanup state without credentials',
    usage: 'orca vm runtimes [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['vm', 'attach'],
    summary: 'Attach an existing VM runtime to a workspace',
    usage: 'orca vm attach --runtime <id> --workspace <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'runtime', 'workspace']
  },
  {
    path: ['vm', 'cleanup'],
    summary: 'Cleanup the specified VM runtime',
    usage: 'orca vm cleanup --runtime <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'runtime']
  },
  {
    path: ['vm', 'stop-cleanup'],
    summary: 'Stop-cleanup the specified VM runtime',
    usage: 'orca vm stop-cleanup --runtime <id> --confirm <runtime-id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'runtime', 'confirm']
  },
  {
    path: ['vm', 'suspend'],
    summary: 'Suspend the specified VM runtime',
    usage: 'orca vm suspend --workspace <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'workspace']
  },
  {
    path: ['vm', 'resume'],
    summary: 'Resume the specified VM runtime',
    usage: 'orca vm resume --workspace <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'workspace']
  },
  {
    path: ['vm', 'cleanup-command'],
    summary: 'Save a VM cleanup command and payload to a new private file',
    usage: 'orca vm cleanup-command --runtime <id> --output-file <path> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'runtime', 'output-file'],
    notes: [
      'The output file can contain provider credentials. It is created exclusively with owner-only permissions.'
    ]
  }
]
