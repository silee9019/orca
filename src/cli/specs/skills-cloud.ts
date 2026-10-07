import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const SKILL_CLOUD_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['skills', 'install-share'],
    summary: 'Authorize and install an exact shared skill version',
    usage: 'orca skills install-share --input-file <request.json> | --input-stdin [--json]',
    notes: [
      'JSON is validated against the same request schema as the runtime before dispatch.',
      'Select the execution runtime with --environment. Include the explicit discovery or install target in the request; no fallback to the CLI filesystem occurs.',
      'Sharing and external account permissions remain enforced by the runtime. This command does not change those permissions.'
    ],
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['skills', 'install-package'],
    summary: 'Authorize and install an exact owned package version',
    usage: 'orca skills install-package --input-file <request.json> | --input-stdin [--json]',
    notes: [
      'JSON is validated against the same request schema as the runtime before dispatch.',
      'Select the execution runtime with --environment. Include the explicit discovery or install target in the request; no fallback to the CLI filesystem occurs.',
      'Sharing and external account permissions remain enforced by the runtime. This command does not change those permissions.'
    ],
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['skills', 'install-bundle-share'],
    summary: 'Authorize and install selected skills from an exact share version',
    usage: 'orca skills install-bundle-share --input-file <request.json> | --input-stdin [--json]',
    notes: [
      'JSON is validated against the same request schema as the runtime before dispatch.',
      'Select the execution runtime with --environment. Include the explicit discovery or install target in the request; no fallback to the CLI filesystem occurs.',
      'Sharing and external account permissions remain enforced by the runtime. This command does not change those permissions.'
    ],
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['skills', 'install-bundle-package'],
    summary: 'Authorize and install selected skills from an exact package version',
    usage:
      'orca skills install-bundle-package --input-file <request.json> | --input-stdin [--json]',
    notes: [
      'JSON is validated against the same request schema as the runtime before dispatch.',
      'Select the execution runtime with --environment. Include the explicit discovery or install target in the request; no fallback to the CLI filesystem occurs.',
      'Sharing and external account permissions remain enforced by the runtime. This command does not change those permissions.'
    ],
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['skills', 'resolve-share'],
    summary: 'Resolve an existing shared skill link',
    usage: 'orca skills resolve-share --input-file <request.json> | --input-stdin [--json]',
    notes: [
      'JSON is validated against the same request schema as the runtime before dispatch.',
      'Select the execution runtime with --environment. Include the explicit discovery or install target in the request; no fallback to the CLI filesystem occurs.',
      'Sharing and external account permissions remain enforced by the runtime. This command does not change those permissions.'
    ],
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['skills', 'package'],
    summary: 'Read an owned skill package',
    usage: 'orca skills package --input-file <request.json> | --input-stdin [--json]',
    notes: [
      'JSON is validated against the same request schema as the runtime before dispatch.',
      'Select the execution runtime with --environment. Include the explicit discovery or install target in the request; no fallback to the CLI filesystem occurs.',
      'Sharing and external account permissions remain enforced by the runtime. This command does not change those permissions.'
    ],
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['skills', 'revoke-share'],
    summary: 'Revoke an exact owned share',
    usage: 'orca skills revoke-share --input-file <request.json> | --input-stdin [--json]',
    notes: [
      'JSON is validated against the same request schema as the runtime before dispatch.',
      'Select the execution runtime with --environment. Include the explicit discovery or install target in the request; no fallback to the CLI filesystem occurs.',
      'Sharing and external account permissions remain enforced by the runtime. This command does not change those permissions.'
    ],
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['skills', 'delete-package'],
    summary: 'Delete an exact owned package',
    usage: 'orca skills delete-package --input-file <request.json> | --input-stdin [--json]',
    notes: [
      'JSON is validated against the same request schema as the runtime before dispatch.',
      'Select the execution runtime with --environment. Include the explicit discovery or install target in the request; no fallback to the CLI filesystem occurs.',
      'Sharing and external account permissions remain enforced by the runtime. This command does not change those permissions.'
    ],
    destructive: true,
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['skills', 'delete-version'],
    summary: 'Delete an exact owned package version',
    usage: 'orca skills delete-version --input-file <request.json> | --input-stdin [--json]',
    notes: [
      'JSON is validated against the same request schema as the runtime before dispatch.',
      'Select the execution runtime with --environment. Include the explicit discovery or install target in the request; no fallback to the CLI filesystem occurs.',
      'Sharing and external account permissions remain enforced by the runtime. This command does not change those permissions.'
    ],
    destructive: true,
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['skills', 'owned-shares'],
    summary: 'List shares owned by the runtime account',
    usage: 'orca skills owned-shares [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  }
]
