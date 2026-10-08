import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const MANAGED_SKILL_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['skills', 'viewer'],
    summary: 'Read or change the mounted desktop skills viewer on its discovery owner',
    usage: 'orca skills viewer --viewer desktop --input-file <action.json> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'input-file', 'input-stdin']
  },
  {
    path: ['skills', 'delete-supported'],
    summary: 'Check the selected runtime skill-delete capability',
    usage: 'orca skills delete-supported [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['skills', 'preview-bundle'],
    summary: 'Preview selected bundle skills without writing',
    usage: 'orca skills preview-bundle --input-file <request.json> | --input-stdin [--json]',
    notes: [
      'JSON is validated against the same request schema as the runtime before dispatch.',
      'Select the execution runtime with --environment. Include the explicit discovery or install target in the request; no fallback to the CLI filesystem occurs.',
      'Sharing and external account permissions remain enforced by the runtime. This command does not change those permissions.'
    ],
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['skills', 'discover'],
    summary: 'Discover skills on an explicit native, SSH, or WSL target',
    usage: 'orca skills discover --input-file <request.json> | --input-stdin [--json]',
    notes: [
      'JSON is validated against the same request schema as the runtime before dispatch.',
      'Select the execution runtime with --environment. Include the explicit discovery or install target in the request; no fallback to the CLI filesystem occurs.',
      'Sharing and external account permissions remain enforced by the runtime. This command does not change those permissions.'
    ],
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['skills', 'preview-install'],
    summary: 'Preview a shared skill installation without writing',
    usage: 'orca skills preview-install --input-file <request.json> | --input-stdin [--json]',
    notes: [
      'JSON is validated against the same request schema as the runtime before dispatch.',
      'Select the execution runtime with --environment. Include the explicit discovery or install target in the request; no fallback to the CLI filesystem occurs.',
      'Sharing and external account permissions remain enforced by the runtime. This command does not change those permissions.'
    ],
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['skills', 'install-shared'],
    summary: 'Install a shared skill on the requested target',
    usage: 'orca skills install-shared --input-file <request.json> | --input-stdin [--json]',
    notes: [
      'JSON is validated against the same request schema as the runtime before dispatch.',
      'Select the execution runtime with --environment. Include the explicit discovery or install target in the request; no fallback to the CLI filesystem occurs.',
      'Sharing and external account permissions remain enforced by the runtime. This command does not change those permissions.'
    ],
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['skills', 'install-bundle'],
    summary: 'Install a shared bundle on the requested target',
    usage: 'orca skills install-bundle --input-file <request.json> | --input-stdin [--json]',
    notes: [
      'JSON is validated against the same request schema as the runtime before dispatch.',
      'Select the execution runtime with --environment. Include the explicit discovery or install target in the request; no fallback to the CLI filesystem occurs.',
      'Sharing and external account permissions remain enforced by the runtime. This command does not change those permissions.'
    ],
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['skills', 'preview-delete'],
    summary: 'Preview exact discovered skills to delete',
    usage: 'orca skills preview-delete --input-file <request.json> | --input-stdin [--json]',
    notes: [
      'JSON is validated against the same request schema as the runtime before dispatch.',
      'Select the execution runtime with --environment. Include the explicit discovery or install target in the request; no fallback to the CLI filesystem occurs.',
      'Sharing and external account permissions remain enforced by the runtime. This command does not change those permissions.'
    ],
    destructive: true,
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['skills', 'delete'],
    summary: 'Delete exact skills through the existing delete plan checks',
    usage: 'orca skills delete --input-file <request.json> | --input-stdin [--json]',
    notes: [
      'JSON is validated against the same request schema as the runtime before dispatch.',
      'Select the execution runtime with --environment. Include the explicit discovery or install target in the request; no fallback to the CLI filesystem occurs.',
      'Sharing and external account permissions remain enforced by the runtime. This command does not change those permissions.'
    ],
    destructive: true,
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['skills', 'remove-install'],
    summary: 'Remove an exact managed skill installation',
    usage: 'orca skills remove-install --input-file <request.json> | --input-stdin [--json]',
    notes: [
      'JSON is validated against the same request schema as the runtime before dispatch.',
      'Select the execution runtime with --environment. Include the explicit discovery or install target in the request; no fallback to the CLI filesystem occurs.',
      'Sharing and external account permissions remain enforced by the runtime. This command does not change those permissions.'
    ],
    destructive: true,
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['skills', 'managed-installs'],
    summary: 'List managed installs on the selected runtime',
    usage: 'orca skills managed-installs [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['skills', 'cancel-install'],
    summary: 'cancel-install for an exact operation',
    usage: 'orca skills cancel-install --operation <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'operation']
  },
  {
    path: ['skills', 'install-progress'],
    summary: 'install-progress for an exact operation',
    usage: 'orca skills install-progress --operation <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'operation']
  }
]
